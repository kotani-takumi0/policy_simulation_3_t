from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db.deps import get_db
from backend.app.db.models import AuditLog, Candidate, Decision, Rationale
from backend.app.schemas.decisions import DecisionCreate, DecisionResponse
from backend.app.utils.tags import csv_to_list, list_to_csv

router = APIRouter(prefix="/api/v1/decisions", tags=["decisions"])


@router.post("", response_model=DecisionResponse, status_code=status.HTTP_201_CREATED)
def create_decision(payload: DecisionCreate, db: Session = Depends(get_db)) -> DecisionResponse:
    candidate = db.get(Candidate, payload.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    reason_tags = [tag.strip() for tag in payload.reason_tags if tag and tag.strip()]
    if not reason_tags:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="reason_tags must be a non-empty list",
        )

    session_record = candidate.query.session if candidate.query else None  # type: ignore[attr-defined]
    decided_by = session_record.user_id if session_record else None
    org_id = session_record.org_id if session_record else None

    decision = Decision(
        candidate_id=candidate.id,
        decision=payload.decision,
        reason_tags=list_to_csv(reason_tags),
        note=payload.note,
        decided_by=decided_by,
    )
    db.add(decision)
    db.flush()

    rationale_id = None
    if any(
        [
            payload.rationale_text,
            payload.evidence_snippet,
            payload.evidence_offset_start is not None,
            payload.evidence_offset_end is not None,
        ]
    ):
        rationale = Rationale(
            decision_id=decision.id,
            rationale_text=payload.rationale_text or "",
            evidence_snippet=payload.evidence_snippet,
            evidence_offset_start=payload.evidence_offset_start,
            evidence_offset_end=payload.evidence_offset_end,
        )
        db.add(rationale)
        db.flush()
        rationale_id = rationale.id

    audit_log = AuditLog(
        user_id=decided_by,
        org_id=org_id,
        action="DECIDE",
        target_id=str(candidate.id),
        ip=None,
        user_agent="decisions-api",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(decision)

    return DecisionResponse(
        id=decision.id,
        candidate_id=decision.candidate_id,
        decision=decision.decision,
        reason_tags=csv_to_list(decision.reason_tags),
        note=decision.note,
        decided_at=decision.decided_at,
        rationale_id=rationale_id,
    )
