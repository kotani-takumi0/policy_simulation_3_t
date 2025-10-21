from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db.deps import get_db
from backend.app.db.models import Org, PolicyCase, User
from backend.app.schemas.cases import PolicyCaseCreate, PolicyCaseDetailResponse, PolicyCaseResponse
from backend.app.schemas.options import OptionSummaryResponse

router = APIRouter(prefix="/api/v1/cases", tags=["cases"])


def _ensure_user_in_org(db: Session, user_id: int, org_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="User does not belong to the specified org",
        )
    return user


@router.post("", response_model=PolicyCaseResponse, status_code=status.HTTP_201_CREATED)
def create_policy_case(payload: PolicyCaseCreate, db: Session = Depends(get_db)) -> PolicyCaseResponse:
    org = db.get(Org, payload.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org not found")

    created_by = payload.created_by
    if created_by is not None:
        _ensure_user_in_org(db, created_by, payload.org_id)

    policy_case = PolicyCase(
        org_id=payload.org_id,
        title=payload.title,
        purpose=payload.purpose,
        background=payload.background,
        constraints=payload.constraints,
        kpis=payload.kpis,
        stakeholders=payload.stakeholders,
        visibility=payload.visibility or "org",
        created_by=created_by,
    )
    db.add(policy_case)
    db.commit()
    db.refresh(policy_case)

    return PolicyCaseResponse.from_orm(policy_case)


@router.get("/{case_id}", response_model=PolicyCaseDetailResponse)
def get_policy_case(case_id: int, db: Session = Depends(get_db)) -> PolicyCaseDetailResponse:
    policy_case = db.get(PolicyCase, case_id)
    if policy_case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy case not found")

    options_response: list[OptionSummaryResponse] = []
    for option in sorted(policy_case.options, key=lambda opt: opt.created_at):
        latest_version = max(
            (version.version_number for version in option.versions),
            default=None,
        )
        options_response.append(
            OptionSummaryResponse(
                id=option.id,
                policy_case_id=option.policy_case_id,
                candidate_id=option.candidate_id,
                title=option.title,
                summary=option.summary,
                visibility=option.visibility,
                created_by=option.created_by,
                created_at=option.created_at,
                updated_at=option.updated_at,
                latest_version_number=latest_version,
            )
        )

    return PolicyCaseDetailResponse(
        id=policy_case.id,
        org_id=policy_case.org_id,
        title=policy_case.title,
        purpose=policy_case.purpose,
        background=policy_case.background,
        constraints=policy_case.constraints,
        kpis=policy_case.kpis,
        stakeholders=policy_case.stakeholders,
        visibility=policy_case.visibility,
        created_by=policy_case.created_by,
        created_at=policy_case.created_at,
        updated_at=policy_case.updated_at,
        options=options_response,
    )
