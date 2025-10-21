from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_check_returns_ok() -> None:
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
