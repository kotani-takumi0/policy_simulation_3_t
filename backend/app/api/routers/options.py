from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.deps import get_db
from backend.app.db.models import (
    AnalysisHistory,
    Assessment,
    AuditLog,
    Candidate,
    Criterion,
    Evidence,
    Option,
    OptionVersion,
    PolicyCase,
    Review,
    Source,
    User,
    WorkflowTransition,
)
from backend.app.schemas.options import (
    AssessmentResponse,
    AssessmentCreate,
    EvidenceCreate,
    EvidenceResponse,
    OptionCreate,
    OptionDetailResponse,
    OptionVersionCreate,
    OptionVersionResponse,
    ReviewCreate,
    ReviewResponse,
    WorkflowTransitionCreate,
    WorkflowTransitionResponse,
)

router = APIRouter(prefix="/api/v1/options", tags=["options"])

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"in_review"},
    "in_review": {"approved", "draft"},
    "approved": {"published", "archived"},
    "published": {"archived"},
    "archived": set(),
}


def _ensure_user_in_org(db: Session, user_id: int, org_id: int) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="User does not belong to the specified org",
        )


def _get_option_or_404(db: Session, option_id: int) -> Option:
    option = db.get(Option, option_id)
    if option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    option.policy_case  # trigger lazy load
    return option


def _get_option_version_or_404(
    db: Session,
    option: Option,
    version_id: int,
) -> OptionVersion:
    version = db.get(OptionVersion, version_id)
    if version is None or version.option_id != option.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option version not found")
    return version


def _log_audit(
    db: Session,
    *,
    user_id: Optional[int],
    org_id: int,
    action: str,
    target_id: str,
) -> None:
    audit = AuditLog(
        user_id=user_id,
        org_id=org_id,
        action=action,
        target_id=target_id,
        ip=None,
        user_agent="options-api",
    )
    db.add(audit)


def _build_option_detail(option: Option) -> OptionDetailResponse:
    versions = sorted(option.versions, key=lambda version: version.version_number)
    version_responses: list[OptionVersionResponse] = []
    for version in versions:
        evidence_responses: list[EvidenceResponse] = []
        for evidence in sorted(version.evidences, key=lambda e: e.created_at):
            source = evidence.source
            evidence_responses.append(
                EvidenceResponse(
                    id=evidence.id,
                    option_version_id=version.id,
                    source_id=evidence.source_id,
                    snippet=evidence.snippet,
                    note=evidence.note,
                    highlight_start=evidence.highlight_start,
                    highlight_end=evidence.highlight_end,
                    created_by=evidence.created_by,
                    created_at=evidence.created_at,
                    source_url=source.url if source else None,
                    source_title=source.title if source else None,
                    source_publisher=source.publisher if source else None,
                    source_published_at=source.published_at if source else None,
                    credibility=source.credibility if source else None,
                )
            )

        assessment_responses: list[AssessmentResponse] = []
        for assessment in sorted(version.assessments, key=lambda a: a.assessed_at):
            criterion = assessment.criterion
            assessment_responses.append(
                AssessmentResponse(
                    id=assessment.id,
                    option_version_id=version.id,
                    criterion_id=assessment.criterion_id,
                    score=assessment.score,
                    note=assessment.note,
                    assessed_by=assessment.assessed_by,
                    assessed_at=assessment.assessed_at,
                    criterion_name=criterion.name if criterion else None,
                    weight=criterion.weight if criterion else None,
                )
            )

        version_responses.append(
            OptionVersionResponse(
                id=version.id,
                option_id=version.option_id,
                version_number=version.version_number,
                content=version.content,
                change_note=version.change_note,
                created_by=version.created_by,
                created_at=version.created_at,
                evidences=evidence_responses,
                assessments=assessment_responses,
            )
        )

    latest_version_number = versions[-1].version_number if versions else None
    workflow_history = sorted(option.workflow_transitions, key=lambda w: w.changed_at)
    workflow_responses = [
        WorkflowTransitionResponse(
            id=transition.id,
            option_id=transition.option_id,
            from_status=transition.from_status,  # type: ignore[arg-type]
            to_status=transition.to_status,  # type: ignore[arg-type]
            note=transition.note,
            changed_by=transition.changed_by,
            changed_at=transition.changed_at,
        )
        for transition in workflow_history
    ]
    review_responses = [
        ReviewResponse(
            id=review.id,
            option_id=review.option_id,
            option_version_id=review.option_version_id,
            reviewer_id=review.reviewer_id,
            outcome=review.outcome,  # type: ignore[arg-type]
            comment=review.comment,
            created_at=review.created_at,
        )
        for review in sorted(option.reviews, key=lambda r: r.created_at)
    ]
    return OptionDetailResponse(
        id=option.id,
        policy_case_id=option.policy_case_id,
        candidate_id=option.candidate_id,
        title=option.title,
        summary=option.summary,
        visibility=option.visibility,
        status=option.status,  # type: ignore[arg-type]
        created_by=option.created_by,
        created_at=option.created_at,
        updated_at=option.updated_at,
        latest_version_number=latest_version_number,
        analysis_history_id=option.analysis_history_id,
        versions=version_responses,
        workflow_history=workflow_responses,
        reviews=review_responses,
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

    analysis_history_id = payload.analysis_history_id
    if analysis_history_id is not None:
        history = db.get(AnalysisHistory, analysis_history_id)
        if history is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis history not found")
        existing_option_id = db.execute(
            select(Option.id).where(Option.analysis_history_id == analysis_history_id)
        ).scalar_one_or_none()
        if existing_option_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis history is already linked to another option",
            )

    option = Option(
        policy_case_id=policy_case.id,
        candidate_id=candidate_id,
        title=payload.title,
        summary=payload.summary,
        visibility=payload.visibility or "org",
        created_by=created_by,
        analysis_history_id=analysis_history_id,
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

    _log_audit(
        db,
        user_id=created_by,
        org_id=policy_case.org_id,
        action="OPTION_CREATED",
        target_id=str(option.id),
    )
    db.commit()

    option.versions  # trigger lazy load while session is open
    return _build_option_detail(option)


@router.get("/{option_id}", response_model=OptionDetailResponse)
def get_option(option_id: int, db: Session = Depends(get_db)) -> OptionDetailResponse:
    option = _get_option_or_404(db, option_id)
    db.expire(option, ["versions", "workflow_transitions", "reviews"])
    option.versions
    option.workflow_transitions
    option.reviews
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
    option = _get_option_or_404(db, option_id)

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

    _log_audit(
        db,
        user_id=payload.created_by,
        org_id=option.policy_case.org_id,
        action="OPTION_VERSION_CREATED",
        target_id=str(option.id),
    )
    db.commit()

    return OptionVersionResponse.from_orm(version)


@router.post(
    "/{option_id}/versions/{version_id}/evidence",
    response_model=OptionDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_evidence(
    option_id: int,
    version_id: int,
    payload: EvidenceCreate,
    db: Session = Depends(get_db),
) -> OptionDetailResponse:
    option = _get_option_or_404(db, option_id)
    version = _get_option_version_or_404(db, option, version_id)
    policy_case = option.policy_case

    if payload.created_by is not None:
        _ensure_user_in_org(db, payload.created_by, policy_case.org_id)

    source: Source | None = None
    if any(
        [
            payload.source_url,
            payload.source_title,
            payload.source_publisher,
            payload.source_published_at is not None,
            payload.credibility is not None,
        ]
    ):
        source = Source(
            url=payload.source_url,
            title=payload.source_title,
            publisher=payload.source_publisher,
            published_at=payload.source_published_at,
            credibility=payload.credibility,
        )
        db.add(source)
        db.flush()

    if (
        payload.highlight_start is not None
        and payload.highlight_end is not None
        and payload.highlight_end < payload.highlight_start
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="highlight_end must be greater than or equal to highlight_start",
        )

    evidence = Evidence(
        option_version_id=version.id,
        source_id=source.id if source else None,
        snippet=payload.snippet,
        note=payload.note,
        highlight_start=payload.highlight_start,
        highlight_end=payload.highlight_end,
        created_by=payload.created_by,
    )
    db.add(evidence)
    db.commit()

    _log_audit(
        db,
        user_id=payload.created_by,
        org_id=policy_case.org_id,
        action="OPTION_EVIDENCE_CREATED",
        target_id=str(option.id),
    )
    db.commit()

    db.refresh(option)
    db.expire(option, ["versions", "workflow_transitions", "reviews"])
    option.versions
    option.workflow_transitions
    option.reviews
    return _build_option_detail(option)


@router.post(
    "/{option_id}/versions/{version_id}/assessments",
    response_model=OptionDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def upsert_assessment(
    option_id: int,
    version_id: int,
    payload: AssessmentCreate,
    db: Session = Depends(get_db),
) -> OptionDetailResponse:
    option = _get_option_or_404(db, option_id)
    version = _get_option_version_or_404(db, option, version_id)
    policy_case = option.policy_case

    criterion = db.get(Criterion, payload.criterion_id)
    if criterion is None or criterion.policy_case_id != policy_case.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Criterion not found for this policy case",
        )

    if payload.assessed_by is not None:
        _ensure_user_in_org(db, payload.assessed_by, policy_case.org_id)

    assessment = db.execute(
        select(Assessment).where(
            Assessment.option_version_id == version.id,
            Assessment.criterion_id == payload.criterion_id,
        )
    ).scalar_one_or_none()

    if assessment is None:
        assessment = Assessment(
            option_version_id=version.id,
            criterion_id=payload.criterion_id,
            score=payload.score,
            note=payload.note,
            assessed_by=payload.assessed_by,
        )
        db.add(assessment)
    else:
        assessment.score = payload.score
        assessment.note = payload.note
        assessment.assessed_by = payload.assessed_by
        assessment.assessed_at = datetime.now(timezone.utc)

    db.commit()

    _log_audit(
        db,
        user_id=payload.assessed_by,
        org_id=policy_case.org_id,
        action="OPTION_ASSESSMENT_RECORDED",
        target_id=str(option.id),
    )
    db.commit()

    db.refresh(option)
    db.expire(option, ["versions", "workflow_transitions", "reviews"])
    option.versions
    option.workflow_transitions
    option.reviews
    return _build_option_detail(option)


@router.post(
    "/{option_id}/workflow/transition",
    response_model=OptionDetailResponse,
    status_code=status.HTTP_200_OK,
)
def transition_option_status(
    option_id: int,
    payload: WorkflowTransitionCreate,
    db: Session = Depends(get_db),
) -> OptionDetailResponse:
    option = _get_option_or_404(db, option_id)
    policy_case = option.policy_case
    from_status = option.status
    to_status = payload.to_status

    if to_status == from_status:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Option is already in the requested status",
        )

    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transition from {from_status} to {to_status} is not allowed",
        )

    if payload.changed_by is not None:
        _ensure_user_in_org(db, payload.changed_by, policy_case.org_id)

    transition = WorkflowTransition(
        option_id=option.id,
        from_status=from_status,
        to_status=to_status,
        note=payload.note,
        changed_by=payload.changed_by,
    )
    option.status = to_status
    db.add(transition)
    db.commit()

    _log_audit(
        db,
        user_id=payload.changed_by,
        org_id=policy_case.org_id,
        action="OPTION_WORKFLOW_TRANSITION",
        target_id=str(option.id),
    )
    db.commit()

    db.refresh(option)
    db.expire(option, ["versions", "workflow_transitions", "reviews"])
    option.versions
    option.workflow_transitions
    option.reviews
    return _build_option_detail(option)


@router.post(
    "/{option_id}/reviews",
    response_model=OptionDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_review(
    option_id: int,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
) -> OptionDetailResponse:
    option = _get_option_or_404(db, option_id)
    version = _get_option_version_or_404(db, option, payload.option_version_id)
    policy_case = option.policy_case

    if payload.reviewer_id is not None:
        _ensure_user_in_org(db, payload.reviewer_id, policy_case.org_id)

    review = Review(
        option_id=option.id,
        option_version_id=version.id,
        reviewer_id=payload.reviewer_id,
        outcome=payload.outcome,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()

    _log_audit(
        db,
        user_id=payload.reviewer_id,
        org_id=policy_case.org_id,
        action="OPTION_REVIEW_SUBMITTED",
        target_id=str(option.id),
    )
    db.commit()

    db.refresh(option)
    db.expire(option, ["versions", "workflow_transitions", "reviews"])
    option.versions
    option.workflow_transitions
    option.reviews
    return _build_option_detail(option)
