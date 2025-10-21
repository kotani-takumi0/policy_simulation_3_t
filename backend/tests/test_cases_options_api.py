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
    Candidate,
    Option,
    OptionVersion,
    Org,
    PolicyCase,
    Query,
    SessionRecord,
    User,
)


@pytest.fixture()
def session_factory(tmp_path) -> Generator[sessionmaker, None, None]:
    db_path = tmp_path / "test_cases.db"
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
def client() -> TestClient:
    return TestClient(app)


def _seed_org_and_user(session: Session) -> tuple[Org, User]:
    org = Org(name="Org A")
    session.add(org)
    session.flush()

    user = User(org_id=org.id, email="owner@example.com", role="analyst")
    session.add(user)
    session.flush()

    session.commit()
    return org, user


def _seed_candidate(session: Session, org: Org, user: User) -> Candidate:
    session_record = SessionRecord(org_id=org.id, user_id=user.id)
    session.add(session_record)
    session.flush()

    query = Query(session_id=session_record.id, text="base query", purpose="overview")
    session.add(query)
    session.flush()

    candidate = Candidate(
        query_id=query.id,
        project_id="PX-1",
        title="Legacy Project",
        ministry="Ministry",
        url="http://example.com",
        rank=0,
        metadata_json=json.dumps({"seed": True}),
    )
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


def test_create_policy_case(client: TestClient, session_factory) -> None:
    session = session_factory()
    try:
        org, user = _seed_org_and_user(session)
    finally:
        session.close()

    response = client.post(
        "/api/v1/cases",
        json={
            "org_id": org.id,
            "title": "Digital Services Reform",
            "purpose": "Improve service quality",
            "created_by": user.id,
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["title"] == "Digital Services Reform"
    assert data["visibility"] == "org"

    check_session = session_factory()
    try:
        stored = check_session.query(PolicyCase).one()
        assert stored.title == "Digital Services Reform"
        assert stored.created_by == user.id
    finally:
        check_session.close()


def test_create_option_with_initial_version(client: TestClient, session_factory) -> None:
    session = session_factory()
    try:
        org, user = _seed_org_and_user(session)
        candidate = _seed_candidate(session, org, user)
    finally:
        session.close()

    case_response = client.post(
        "/api/v1/cases",
        json={
            "org_id": org.id,
            "title": "Budget Optimization",
            "created_by": user.id,
        },
    )
    assert case_response.status_code == 201, case_response.text
    case_id = case_response.json()["id"]

    option_response = client.post(
        "/api/v1/options",
        json={
            "policy_case_id": case_id,
            "candidate_id": candidate.id,
            "title": "Introduce phased rollout",
            "summary": "Gradually deploy digital forms",
            "body": "Version 1 content",
            "change_note": "Initial draft",
            "created_by": user.id,
        },
    )
    assert option_response.status_code == 201, option_response.text
    option_data = option_response.json()
    assert option_data["title"] == "Introduce phased rollout"
    assert option_data["candidate_id"] == candidate.id
    assert option_data["latest_version_number"] == 1
    assert option_data["versions"][0]["content"] == "Version 1 content"

    check_session = session_factory()
    try:
        option = check_session.query(Option).one()
        versions = check_session.query(OptionVersion).filter_by(option_id=option.id).all()
        assert len(versions) == 1
        assert versions[0].version_number == 1
    finally:
        check_session.close()


def test_create_option_version_increments_version_number(client: TestClient, session_factory) -> None:
    session = session_factory()
    try:
        org, user = _seed_org_and_user(session)
    finally:
        session.close()

    case_response = client.post(
        "/api/v1/cases",
        json={"org_id": org.id, "title": "Service Delivery", "created_by": user.id},
    )
    assert case_response.status_code == 201, case_response.text
    case_id = case_response.json()["id"]

    option_response = client.post(
        "/api/v1/options",
        json={
            "policy_case_id": case_id,
            "title": "Centralize support",
            "summary": "Create central support desk",
            "body": "Initial body",
            "created_by": user.id,
        },
    )
    assert option_response.status_code == 201, option_response.text
    option_id = option_response.json()["id"]

    version_response = client.post(
        f"/api/v1/options/{option_id}/versions",
        json={
            "content": "Second iteration body",
            "change_note": "Incorporate reviewer feedback",
            "created_by": user.id,
        },
    )
    assert version_response.status_code == 201, version_response.text
    version_data = version_response.json()
    assert version_data["version_number"] == 2

    latest_option = client.get(f"/api/v1/options/{option_id}").json()
    assert latest_option["latest_version_number"] == 2
    assert len(latest_option["versions"]) == 2
