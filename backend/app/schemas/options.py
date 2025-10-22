from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field
try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover - fallback for v1
    ConfigDict = dict  # type: ignore


VisibilityLiteral = Literal["private", "org", "public"]
StatusLiteral = Literal["draft", "in_review", "approved", "published", "archived"]
ReviewOutcomeLiteral = Literal["comment", "approve", "request_changes"]


class WorkflowTransitionResponse(BaseModel):
    id: int
    option_id: int
    from_status: StatusLiteral
    to_status: StatusLiteral
    note: Optional[str]
    changed_by: Optional[int]
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class WorkflowTransitionCreate(BaseModel):
    to_status: StatusLiteral
    note: Optional[str] = None
    changed_by: Optional[int] = None


class EvidenceCreate(BaseModel):
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_publisher: Optional[str] = None
    source_published_at: Optional[datetime] = None
    credibility: Optional[float] = Field(default=None, ge=0, le=1)
    snippet: Optional[str] = None
    note: Optional[str] = None
    highlight_start: Optional[int] = Field(default=None, ge=0)
    highlight_end: Optional[int] = Field(default=None, ge=0)
    created_by: Optional[int] = None


class EvidenceResponse(BaseModel):
    id: int
    option_version_id: int
    source_id: Optional[int]
    snippet: Optional[str]
    note: Optional[str]
    highlight_start: Optional[int]
    highlight_end: Optional[int]
    created_by: Optional[int]
    created_at: datetime
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_publisher: Optional[str] = None
    source_published_at: Optional[datetime] = None
    credibility: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class CriterionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    weight: Optional[float] = None


class CriterionResponse(BaseModel):
    id: int
    policy_case_id: int
    name: str
    description: Optional[str]
    weight: Optional[float]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class AssessmentCreate(BaseModel):
    criterion_id: int
    score: Optional[float] = None
    note: Optional[str] = None
    assessed_by: Optional[int] = None


class AssessmentResponse(BaseModel):
    id: int
    option_version_id: int
    criterion_id: int
    score: Optional[float]
    note: Optional[str]
    assessed_by: Optional[int]
    assessed_at: datetime
    criterion_name: Optional[str] = None
    weight: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class ReviewCreate(BaseModel):
    option_version_id: int
    reviewer_id: Optional[int] = None
    outcome: ReviewOutcomeLiteral = "comment"
    comment: Optional[str] = None


class ReviewResponse(BaseModel):
    id: int
    option_id: int
    option_version_id: int
    reviewer_id: Optional[int]
    outcome: ReviewOutcomeLiteral
    comment: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class OptionVersionCreate(BaseModel):
    content: str = Field(..., min_length=1)
    change_note: Optional[str] = None
    created_by: Optional[int] = None


class OptionVersionResponse(BaseModel):
    id: int
    option_id: int
    version_number: int
    content: str
    change_note: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    evidences: List[EvidenceResponse] = []
    assessments: List[AssessmentResponse] = []

    # Pydantic v2 way to allow ORM objects
    model_config = ConfigDict(from_attributes=True)  # type: ignore


class OptionCreate(BaseModel):
    policy_case_id: int
    title: str = Field(..., min_length=1)
    summary: Optional[str] = None
    body: str = Field(..., min_length=1)
    change_note: Optional[str] = None
    candidate_id: Optional[int] = None
    created_by: Optional[int] = None
    visibility: Optional[VisibilityLiteral] = Field(default="org")
    analysis_history_id: Optional[int] = None


class OptionSummaryResponse(BaseModel):
    id: int
    policy_case_id: int
    candidate_id: Optional[int] = None
    title: str
    summary: Optional[str] = None
    visibility: str
    status: StatusLiteral
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    latest_version_number: Optional[int] = None
    analysis_history_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class OptionDetailResponse(OptionSummaryResponse):
    versions: List[OptionVersionResponse]
    workflow_history: List[WorkflowTransitionResponse] = []
    reviews: List[ReviewResponse] = []
