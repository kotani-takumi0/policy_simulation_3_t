from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.deps import get_db
from backend.app.db.models import (
    Candidate,
    Option,
    OptionVersion,
    PolicyCase,
    User,
)
from backend.app.schemas.options import (
    OptionCreate,
    OptionDetailResponse,
    OptionVersionCreate,
    OptionVersionResponse,
)

router = APIRouter(prefix="/api/v1/options", tags=["options"])


def _ensure_user_in_org(db: Session, user_id: int, org_id: int) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="User does not belong to the specified org",
        )


def _build_option_detail(option: Option) -> OptionDetailResponse:
    versions = sorted(option.versions, key=lambda version: version.version_number)
    version_responses = [
        OptionVersionResponse.from_orm(version) for version in versions
    ]
    latest_version_number = versions[-1].version_number if versions else None
    return OptionDetailResponse(
        id=option.id,
        policy_case_id=option.policy_case_id,
        candidate_id=option.candidate_id,
        title=option.title,
        summary=option.summary,
        visibility=option.visibility,
        created_by=option.created_by,
        created_at=option.created_at,
        updated_at=option.updated_at,
        latest_version_number=latest_version_number,
        versions=version_responses,
    )


@router.post("", response_model=OptionDetailResponse, status_code=status.HTTP_201_CREATED)
def create_option(payload: OptionCreate, db: Session = Depends(get_db)) -> OptionDetailResponse:
    policy_case = db.get(PolicyCase, payload.policy_case_id)
    if policy_case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy case not found")

    created_by = payload.created_by
    if created_by is not None:
        _ensure_user_in_org(db, created_by, policy_case.org_id)

    if payload.visibility not in {"private", "org", "public", None}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid visibility",
        )

    candidate_id = payload.candidate_id
    if candidate_id is not None:
        candidate = db.get(Candidate, candidate_id)
        if candidate is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    option = Option(
        policy_case_id=policy_case.id,
        candidate_id=candidate_id,
        title=payload.title,
        summary=payload.summary,
        visibility=payload.visibility or "org",
        created_by=created_by,
    )
    db.add(option)
    db.flush()

    version = OptionVersion(
        option_id=option.id,
        version_number=1,
        content=payload.body,
        change_note=payload.change_note,
        created_by=created_by,
    )
    db.add(version)
    db.commit()
    db.refresh(option)

    option.versions  # trigger lazy load while session is open
    return _build_option_detail(option)


@router.get("/{option_id}", response_model=OptionDetailResponse)
def get_option(option_id: int, db: Session = Depends(get_db)) -> OptionDetailResponse:
    option = db.get(Option, option_id)
    if option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    option.versions
    return _build_option_detail(option)


@router.post(
    "/{option_id}/versions",
    response_model=OptionVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_option_version(
    option_id: int,
    payload: OptionVersionCreate,
    db: Session = Depends(get_db),
) -> OptionVersionResponse:
    option = db.get(Option, option_id)
    if option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")

    if payload.created_by is not None:
        policy_case = option.policy_case
        _ensure_user_in_org(db, payload.created_by, policy_case.org_id)

    result = db.execute(
        select(OptionVersion.version_number)
        .where(OptionVersion.option_id == option_id)
        .order_by(OptionVersion.version_number.desc())
        .limit(1)
    ).scalar_one_or_none()
    next_version_number = (result or 0) + 1

    version = OptionVersion(
        option_id=option_id,
        version_number=next_version_number,
        content=payload.content,
        change_note=payload.change_note,
        created_by=payload.created_by,
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    return OptionVersionResponse.from_orm(version)
