"""FastAPI application for PromptPad."""

from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(
    title="PromptPad API",
    description="A small prompt playground API with an OpenAI-compatible provider.",
    version="1.0.0",
)


class ChatRequest(BaseModel):
    """A prompt submitted by the frontend."""

    model_config = ConfigDict(str_strip_whitespace=True)

    prompt: str = Field(min_length=1, max_length=4_000)


class ChatResponse(BaseModel):
    """A response returned to the frontend."""

    reply: str
    mode: str


def _setting(name: str, default: str = "") -> str:
    """Read an environment setting, trimming accidental whitespace."""

    return os.getenv(name, default).strip()


@app.get("/api/health")
async def health() -> dict[str, str | bool]:
    """Return a lightweight health check without exposing credentials."""

    return {
        "status": "ok",
        "ai_configured": bool(_setting("LLM_API_KEY")),
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Return a demo response or forward the prompt to an OpenAI-compatible API."""

    api_key = _setting("LLM_API_KEY")
    if not api_key:
        return ChatResponse(
            mode="demo",
            reply=(
                "PromptPad is running and your backend received the prompt. "
                "This is demo mode because LLM_API_KEY is not configured. "
                "Add a provider key to the server environment to enable live AI responses."
            ),
        )

    base_url = _setting("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = _setting("LLM_MODEL")
    if not model:
        raise HTTPException(
            status_code=500,
            detail="LLM_MODEL is not configured on the server.",
        )

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant. Give clear, concise answers.",
            },
            {"role": "user", "content": request.prompt},
        ],
        "max_tokens": 500,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0)) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            reply = data["choices"][0]["message"]["content"]
            if not isinstance(reply, str) or not reply.strip():
                raise ValueError("The model returned an empty response.")
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="The AI provider took too long to respond.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"The AI provider returned HTTP {exc.response.status_code}.",
        ) from exc
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not process the response from the AI provider.",
        ) from exc

    return ChatResponse(reply=reply.strip(), mode="live")
