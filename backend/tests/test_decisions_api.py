from __future__ import annotations

import json
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.main import app
from backend.app.db.base import Base
from backend.app.db.deps import get_db
from backend.app.db.models import (
    AuditLog,
    Candidate,
    Decision,
    DecisionTag,
    Org,
    Query,
    SessionRecord,
    Tag,
    User,
)


@pytest.fixture()
def session_factory(tmp_path) -> Generator[sessionmaker, None, None]:
    db_path = tmp_path / "test.db"
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
def candidate_id(session_factory) -> int:
    session = session_factory()
    try:
        org = Org(name="Test Org")
        session.add(org)
        session.flush()

        user = User(org_id=org.id, email="test@example.com", role="analyst")
        session.add(user)
        session.flush()

        sess = SessionRecord(org_id=org.id, user_id=user.id)
        session.add(sess)
        session.flush()

        query = Query(session_id=sess.id, text="project text", purpose="purpose")
        session.add(query)
        session.flush()

        candidate = Candidate(
            query_id=query.id,
            project_id="P1",
            title="Project One",
            ministry="Ministry",
            url="http://example.com",
            rank=0,
            metadata_json=json.dumps({"sample": True}),
        )
        session.add(candidate)
        session.commit()
        return candidate.id
    finally:
        session.close()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_create_decision_requires_reason_tags(client: TestClient, candidate_id: int) -> None:
    response = client.post(
        "/api/v1/decisions",
        json={
            "candidate_id": candidate_id,
            "decision": "adopt",
            "reason_tags": [],
        },
    )
    assert response.status_code == 422
    assert "reason_tags" in response.text


def test_create_decision_success(client: TestClient, session_factory, candidate_id: int) -> None:
    payload = {
        "candidate_id": candidate_id,
        "decision": "hold",
        "reason_tags": ["needs-review"],
        "note": "Check again later",
        "rationale_text": "Pending clarification",
    }
    response = client.post("/api/v1/decisions", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["reason_tags"] == ["needs-review"]

    session = session_factory()
    try:
        decisions = session.query(Decision).all()
        audits = session.query(AuditLog).all()
        tags = session.query(Tag).all()
        decision_tags = session.query(DecisionTag).all()
        assert len(decisions) == 1
        assert len(audits) == 1
        assert len(tags) == 1
        assert len(decision_tags) == 1
        assert decisions[0].reason_tags == "needs-review"
        assert audits[0].action == "DECIDE"
        assert tags[0].key == "needs-review"
        assert tags[0].label == "needs-review"
        assert decision_tags[0].applied_label == "needs-review"
        assert decision_tags[0].tag_id == tags[0].id
    finally:
        session.close()


def test_create_decision_normalizes_tags(client: TestClient, session_factory, candidate_id: int) -> None:
    payload = {
        "candidate_id": candidate_id,
        "decision": "adopt",
        "reason_tags": ["Needs  Review", "Long Term"],
    }
    response = client.post("/api/v1/decisions", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert sorted(data["reason_tags"]) == ["Long Term", "Needs  Review"]

    session = session_factory()
    try:
        tags = session.query(Tag).order_by(Tag.key).all()
        assert [tag.key for tag in tags] == ["long-term", "needs-review"]
        assert {tag.label for tag in tags} == {"Needs  Review", "Long Term"}
    finally:
        session.close()
