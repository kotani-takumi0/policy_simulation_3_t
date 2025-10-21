from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field
try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover - fallback for v1
    ConfigDict = dict  # type: ignore


VisibilityLiteral = Literal["private", "org", "public"]


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


class OptionSummaryResponse(BaseModel):
    id: int
    policy_case_id: int
    candidate_id: Optional[int] = None
    title: str
    summary: Optional[str] = None
    visibility: str
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    latest_version_number: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class OptionDetailResponse(OptionSummaryResponse):
    versions: List[OptionVersionResponse]
