# PromptPad — React + FastAPI + Docker + GitHub Actions

PromptPad is a small full-stack starter project for learning CI/CD. It contains:

- **Frontend:** React + Vite.
- **Backend:** FastAPI.
- **Local development:** Docker Compose.
- **Container registry:** GitHub Container Registry (GHCR).
- **Deployment:** GitHub Actions builds and publishes images, then uses AWS OIDC + Systems Manager Run Command to update an EC2 instance.
- **Reverse proxy:** Nginx serves the React app and forwards `/api/*` requests to FastAPI.

The project runs in **demo mode** when `LLM_API_KEY` is empty. It can call an OpenAI-compatible Chat Completions endpoint when a provider key and model are configured on the server.

> Security note: the demo `/api/chat` endpoint has no user authentication or per-user quota. Keep `LLM_API_KEY` empty for the first public deployment. Before enabling a billable model provider on a publicly reachable site, add authentication, rate limiting, abuse controls, and provider spending limits. Never put provider keys in React/Vite variables or frontend code.

## 1. Project structure

```text
promptpad/
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── tests/
│   │   └── test_main.py
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── style.css
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.js
├── .github/workflows/cicd.yml
├── compose.yaml
├── compose.prod.yaml
└── .env.example
```

## 2. Run locally with Docker Compose

Requirements: Docker Engine and the Docker Compose plugin. Node.js 22+ and npm are needed only if you also want to run the frontend outside Docker.

The starter intentionally does not include a generated `package-lock.json` because package installation could not be completed in the file-generation environment. Generate and commit one on your machine before treating builds as reproducible:

```bash
cd frontend
npm install
cd ..
git add frontend/package-lock.json
```

After committing the lockfile, change `npm install` to `npm ci` in `frontend/Dockerfile` and the frontend install step in `.github/workflows/cicd.yml`. You can then add `cache: npm` and `cache-dependency-path: frontend/package-lock.json` to `actions/setup-node`.

Run locally:

```bash
cp .env.example .env
docker compose up --build -d
```

Open:

- App: `http://localhost`
- Health check: `http://localhost/api/health`

Check logs and containers:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

The frontend is the only service published on host port `80`. The FastAPI container is reachable only on the Compose network; Nginx proxies `/api/` requests to it.

### Enable real AI responses later

Edit `.env` on your development machine:

```dotenv
LLM_API_KEY=your-provider-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=your-provider-model-id
```

Then recreate the backend container:

```bash
docker compose up -d --force-recreate api
```

The backend expects an OpenAI-compatible endpoint at `/chat/completions`. Provider-specific model names and request parameters may vary. Do not configure a billable provider key on an unprotected public endpoint.

## 3. Prepare an AWS EC2 instance

This deployment design uses **AWS Systems Manager (SSM)** rather than opening SSH to GitHub-hosted runners.

Create an Ubuntu EC2 instance with an **x86_64 / AMD64** architecture. The workflow builds `linux/amd64` images. If you select an ARM/Graviton instance, update both Buildx `platforms` values in `.github/workflows/cicd.yml` to `linux/arm64` (or build a multi-platform image).

On the EC2 instance:

1. Attach an instance profile / IAM role with the AWS-managed `AmazonSSMManagedInstanceCore` policy.
2. Ensure the SSM Agent is installed and running, and that the instance appears as an **Online managed node** in Systems Manager.
3. Install Docker Engine and the Docker Compose plugin using the official instructions: <https://docs.docker.com/engine/install/ubuntu/>.
4. Confirm `docker --version` and `docker compose version` work for the account used by SSM Run Command (normally commands run as root).
5. Create the deployment directory and an optional server-side environment file:

```bash
sudo mkdir -p /opt/promptpad
sudo chmod 755 /opt/promptpad
sudo tee /opt/promptpad/.env >/dev/null <<'ENV_FILE'
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=
ENV_FILE
sudo chmod 600 /opt/promptpad/.env
```

The workflow updates `/opt/promptpad/compose.prod.yaml` and runs `docker compose`. It does not overwrite `/opt/promptpad/.env`.

### EC2 security group

For the first HTTP deployment, allow:

- TCP `80` from `0.0.0.0/0` so visitors can access the website.
- TCP `443` only when you have configured HTTPS.
- TCP `22` only from your own administrative IP if you need SSH for manual administration. The GitHub Actions deployment in this project uses SSM and does **not** need inbound SSH.

Do not expose backend port `8000`; it is internal to the Docker Compose network. The instance needs outbound access to pull public GHCR images and, when enabled, call the model provider.

> This starter serves HTTP on port 80. Add a domain and HTTPS (for example with a TLS reverse proxy or CloudFront) before treating it as a production service.

## 4. Configure GitHub Container Registry (GHCR)

The workflow builds two images and publishes them to GHCR:

- `ghcr.io/<github-owner>/promptpad-backend`
- `ghcr.io/<github-owner>/promptpad-frontend`

It tags each image with `sha-<commit-sha>` and `latest`. The EC2 deployment uses the commit-specific tag, not `latest`.

The workflow uses the automatically provided `GITHUB_TOKEN` with `packages: write`; you do not need to create a GHCR password secret.

The first workflow run may successfully publish the images but fail at the deployment step because newly created GHCR packages are private by default. After that first image push, open the published packages in GitHub and set their visibility to **Public**, then rerun the workflow from `main` so EC2 can pull them without a registry password. Public images can be downloaded by anyone. If you want private images, configure a dedicated read-only `read:packages` credential on EC2 instead; do not make a private image public just to make the tutorial work.

## 5. Configure AWS OIDC for the deployment workflow

The GitHub workflow uses OIDC to assume an AWS IAM role. It does not use long-lived AWS access-key secrets.

In AWS IAM:

1. Create the GitHub OIDC identity provider if it does not already exist:
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. Create an IAM role for the GitHub deployment workflow.
3. Configure its trust policy to trust only this repository and the `main` branch (or a protected GitHub Environment if you later add one). Do not use a wildcard that trusts every repository.
4. Grant that role only the SSM permissions needed to send `AWS-RunShellScript` to the selected EC2 instance and retrieve the command invocation result. Scope `ssm:SendCommand` to the specific instance and AWS-owned `AWS-RunShellScript` document where possible. `ssm:GetCommandInvocation` may require `Resource: "*"` according to the action's IAM authorization model.

Important: GitHub's OIDC `sub` claim format can vary with repository creation date and organization settings. Build the trust condition from the current GitHub/AWS documentation and your repository's actual claims; do not blindly copy an old subject string. See:

- <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws>
- <https://github.com/aws-actions/configure-aws-credentials>

The EC2 instance role and the GitHub deployment role are different:

- **EC2 instance role:** lets the instance communicate with Systems Manager (`AmazonSSMManagedInstanceCore`).
- **GitHub deployment role:** lets the workflow request an SSM command for that instance and check its result.

## 6. Configure GitHub repository variables

In your GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and create:

| Variable | Example value |
|---|---|
| `AWS_REGION` | `ap-south-1` (use the region where your EC2 instance exists) |
| `EC2_INSTANCE_ID` | `i-0123456789abcdef0` |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::123456789012:role/github-promptpad-deploy` |

No AWS access key or SSH private key is required by this workflow. The OIDC role ARN is configuration, not a secret.

## 7. Push the project and run the pipeline

Create a GitHub repository, copy these project files into it, then run:

```bash
git init
git add .
git commit -m "feat: add PromptPad full-stack starter"
git branch -M main
git remote add origin https://github.com/YOUR_OWNER/YOUR_REPOSITORY.git
git push -u origin main
```

The workflow is `.github/workflows/cicd.yml` and has four jobs:

1. `validate-backend`: installs Python dependencies, runs Ruff, and runs pytest.
2. `validate-frontend`: installs npm dependencies and builds the React app.
3. `build-and-push`: after both validation jobs pass on `main`, builds and pushes the frontend/backend images to GHCR.
4. `deploy-ec2`: assumes the AWS role using OIDC, sends a deployment command through SSM, pulls the commit-tagged images, starts the Compose services, and checks `/api/health`.

Pull requests run validation but do not publish images or deploy. A push to `main` runs the full pipeline. `workflow_dispatch` is also available from the Actions tab; choose `main` to deploy.

## 8. Troubleshooting

- **SSM instance not online:** check the EC2 instance profile, SSM Agent, instance connectivity, and Systems Manager managed-node status.
- **AccessDenied for `SendCommand`:** review the GitHub OIDC role trust policy and its SSM permissions.
- **GHCR pull unauthorized:** confirm both packages are public, or configure a read-only GHCR credential on EC2.
- **Docker command not found:** install Docker Engine and the Compose plugin on EC2.
- **Port 80 not reachable:** check the EC2 security group, instance state, and Docker container status.
- **Health check fails:** inspect `docker compose -f /opt/promptpad/compose.prod.yaml logs` on EC2.
- **AI response remains in demo mode:** this is expected while `LLM_API_KEY` is empty. Add a provider key only after implementing authentication, rate limiting, and usage controls.

## 9. Important limitations

This is a learning/deployment starter, not a complete production AI service. It intentionally has no user authentication, persistent chat history, database, rate limiting, or HTTPS configuration. The AI provider key stays on the backend, but a public `/api/chat` endpoint could still consume your provider quota if you enable a key without adding access controls.
