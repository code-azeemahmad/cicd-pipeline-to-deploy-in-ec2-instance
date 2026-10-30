"""Tests for the PromptPad API."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_demo_mode_when_no_key(monkeypatch) -> None:
    """The health endpoint must not require an AI provider key."""

    monkeypatch.delenv("LLM_API_KEY", raising=False)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "ai_configured": False}


def test_chat_returns_demo_message_without_key(monkeypatch) -> None:
    """Chat remains usable in demo mode without paid provider credentials."""

    monkeypatch.delenv("LLM_API_KEY", raising=False)

    response = client.post("/api/chat", json={"prompt": "Explain Docker"})

    assert response.status_code == 200
    assert response.json()["mode"] == "demo"
    assert "backend received the prompt" in response.json()["reply"]


def test_chat_rejects_empty_prompt() -> None:
    """The API validates prompt input."""

    response = client.post("/api/chat", json={"prompt": "   "})

    assert response.status_code == 422


def test_chat_rejects_oversized_prompt() -> None:
    """The API limits prompt size."""

    response = client.post("/api/chat", json={"prompt": "x" * 4_001})

    assert response.status_code == 422
