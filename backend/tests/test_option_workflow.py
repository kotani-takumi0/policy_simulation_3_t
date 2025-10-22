from __future__ import annotations

from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.main import app
from backend.app.db.base import Base
from backend.app.db.deps import get_db
from backend.app.db.models import Org, PolicyCase, User


@pytest.fixture()
def session_factory(tmp_path) -> Generator[sessionmaker, None, None]:
    db_path = tmp_path / "workflow.db"
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
def seeded_entities(session_factory) -> tuple[int, int]:
    session = session_factory()
    try:
        org = Org(name="Unit Test Org")
        session.add(org)
        session.flush()

        user = User(org_id=org.id, email="policy.manager@example.com", role="admin")
        session.add(user)
        session.commit()
        return org.id, user.id
    finally:
        session.close()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_option_workflow_and_reviews(
    client: TestClient, seeded_entities, session_factory
) -> None:
    org_id, user_id = seeded_entities

    case_payload = {
        "org_id": org_id,
        "title": "地域DX推進ケース",
        "purpose": "各部門のDX推進方針を整理する",
        "created_by": user_id,
    }
    case_response = client.post("/api/v1/cases", json=case_payload)
    assert case_response.status_code == 201, case_response.text
    policy_case = case_response.json()

    history_payload = {
        "projectName": "地域DX推進ケース",
        "projectOverview": "",
        "currentSituation": "",
        "initialBudget": 0,
        "references": [],
        "estimatedBudget": 0,
    }
    history_response = client.post("/api/v1/save_analysis", json=history_payload)
    assert history_response.status_code == 200, history_response.text
    history_id = history_response.json()["id"]

    option_payload = {
        "policy_case_id": policy_case["id"],
        "title": "デジタル相談窓口設置",
        "summary": "庁内のDX相談窓口を設置する案",
        "body": "第1版のドラフトです。",
        "created_by": user_id,
        "analysis_history_id": history_id,
    }
    option_response = client.post("/api/v1/options", json=option_payload)
    assert option_response.status_code == 201, option_response.text
    option_detail = option_response.json()
    option_id = option_detail["id"]
    latest_version_id = option_detail["versions"][-1]["id"]
    assert option_detail["analysis_history_id"] == history_id

    # Add criterion
    criterion_response = client.post(
        f"/api/v1/cases/{policy_case['id']}/criteria",
        json={"name": "実現可能性", "weight": 0.5},
    )
    assert criterion_response.status_code == 201, criterion_response.text
    criterion = criterion_response.json()

    # Record assessment
    assessment_payload = {
        "criterion_id": criterion["id"],
        "score": 0.8,
        "note": "既存体制の延長で導入可能",
        "assessed_by": user_id,
    }
    assessment_response = client.post(
        f"/api/v1/options/{option_id}/versions/{latest_version_id}/assessments",
        json=assessment_payload,
    )
    assert assessment_response.status_code == 201, assessment_response.text
    option_detail = assessment_response.json()

    # Attach evidence
    evidence_payload = {
        "source_url": "https://example.com/report",
        "snippet": "他自治体の成功事例がある",
        "created_by": user_id,
    }
    evidence_response = client.post(
        f"/api/v1/options/{option_id}/versions/{latest_version_id}/evidence",
        json=evidence_payload,
    )
    assert evidence_response.status_code == 201, evidence_response.text

    # Transition to in_review
    transition_response = client.post(
        f"/api/v1/options/{option_id}/workflow/transition",
        json={"to_status": "in_review", "changed_by": user_id},
    )
    assert transition_response.status_code == 200, transition_response.text
    option_detail = transition_response.json()
    assert option_detail["status"] == "in_review"
    assert len(option_detail["workflow_history"]) >= 1

    # Submit review
    review_payload = {
        "option_version_id": latest_version_id,
        "reviewer_id": user_id,
        "outcome": "approve",
        "comment": "問題なし",
    }
    review_response = client.post(
        f"/api/v1/options/{option_id}/reviews",
        json=review_payload,
    )
    assert review_response.status_code == 201, review_response.text
    option_detail = review_response.json()
    assert option_detail["reviews"], "レビューが記録されていること"

    # Approve option
    approve_response = client.post(
        f"/api/v1/options/{option_id}/workflow/transition",
        json={"to_status": "approved", "changed_by": user_id},
    )
    assert approve_response.status_code == 200, approve_response.text
    option_detail = approve_response.json()
    assert option_detail["status"] == "approved"

    # Validate assessments & evidence are returned in detail
    latest_version = option_detail["versions"][-1]
    assert any(item["criterion_id"] == criterion["id"] for item in latest_version["assessments"])
    assert latest_version["evidences"], "根拠が1件以上含まれていること"

    history_list_response = client.get("/api/v1/history")
    assert history_list_response.status_code == 200
    history_items = history_list_response.json()
    assert any(item.get("linkedOptionId") == option_id for item in history_items)
