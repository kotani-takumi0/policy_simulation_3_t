from __future__ import annotations

import json
from typing import Generator

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.main import app
from backend.app.db.base import Base
from backend.app.db.deps import get_db
from backend.app.db.models import AnalysisHistory


@pytest.fixture()
def session_factory(tmp_path) -> Generator[sessionmaker, None, None]:
    db_path = tmp_path / "analysis_test.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        future=True,
        class_=Session,
    )
    try:
        yield TestingSessionLocal
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture(autouse=True)
def override_dependency(session_factory):
    def _get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def client(monkeypatch) -> TestClient:
    from backend.app.api.routers import analyses as analyses_router

    monkeypatch.setattr(analyses_router, "_get_openai_client", lambda: object())
    monkeypatch.setattr(
        analyses_router,
        "_compute_embedding",
        lambda client, text: np.array([0.1, 0.2, 0.3], dtype="float32"),
    )
    monkeypatch.setattr(
        analyses_router.semantic_search,
        "analyze_similarity",
        lambda vec1, vec2: {
            "similar_projects": [
                {
                    "project_name": "Sample Project",
                    "ministry_name": "Test Ministry",
                    "budget": 12345.0,
                    "similarity": 0.9,
                }
            ],
            "predicted_budget": 54321.0,
        },
    )
    return TestClient(app)


def test_create_analysis_success(client: TestClient, session_factory) -> None:
    payload = {
        "projectName": "Digital Initiative",
        "projectOverview": "Digitize legacy processes",
        "currentSituation": "Manual workflows cause delays",
        "initialBudget": 1000000,
    }

    response = client.post("/api/v1/analyses", json=payload)
    assert response.status_code == 200, response.text

    data = response.json()
    assert data["estimated_budget"] == 54321.0
    assert data["initial_budget"] == 1000000
    assert data["history_id"] is not None
    assert len(data["references"]) == 1

    session = session_factory()
    try:
        records = session.query(AnalysisHistory).all()
        assert len(records) == 1
        assert json.loads(records[0].references_json)[0]["project_name"] == "Sample Project"
    finally:
        session.close()


def test_save_analysis_and_history_listing(client: TestClient) -> None:
    save_payload = {
        "projectName": "Urban Renewal",
        "projectOverview": "Improve infrastructure",
        "currentSituation": "Aging roads and bridges",
        "initialBudget": 2000000,
        "references": [{"project_name": "Case A"}],
        "estimatedBudget": 2500000,
    }

    save_response = client.post("/api/v1/save_analysis", json=save_payload)
    assert save_response.status_code == 200, save_response.text
    save_data = save_response.json()
    assert save_data["status"] == "success"
    history_id = save_data["id"]

    history_response = client.get("/api/v1/history")
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 1
    item = history[0]
    assert item["id"] == history_id
    assert item["projectName"] == "Urban Renewal"

    delete_response = client.delete(f"/api/v1/history/{history_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "success"

    empty_history = client.get("/api/v1/history").json()
    assert empty_history == []

