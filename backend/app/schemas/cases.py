from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field
try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover - fallback for v1
    ConfigDict = dict  # type: ignore

from backend.app.schemas.options import OptionSummaryResponse, VisibilityLiteral


class PolicyCaseCreate(BaseModel):
    org_id: int
    title: str = Field(..., min_length=1)
    purpose: Optional[str] = None
    background: Optional[str] = None
    constraints: Optional[str] = None
    kpis: Optional[str] = None
    stakeholders: Optional[str] = None
    visibility: Optional[VisibilityLiteral] = Field(default="org")
    created_by: Optional[int] = None


class PolicyCaseResponse(BaseModel):
    id: int
    org_id: int
    title: str
    purpose: Optional[str] = None
    background: Optional[str] = None
    constraints: Optional[str] = None
    kpis: Optional[str] = None
    stakeholders: Optional[str] = None
    visibility: str
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class PolicyCaseDetailResponse(PolicyCaseResponse):
    options: List[OptionSummaryResponse]
