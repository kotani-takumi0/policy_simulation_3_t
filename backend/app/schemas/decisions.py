from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, validator
try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover
    ConfigDict = dict  # type: ignore


class DecisionCreate(BaseModel):
    candidate_id: int = Field(..., ge=1)
    decision: Literal["adopt", "hold", "reject"]
    reason_tags: List[str]
    note: Optional[str] = None
    rationale_text: Optional[str] = None
    evidence_snippet: Optional[str] = None
    evidence_offset_start: Optional[int] = Field(default=None, ge=0)
    evidence_offset_end: Optional[int] = Field(default=None, ge=0)

    @validator("reason_tags")
    def validate_reason_tags(cls, value: List[str]) -> List[str]:
        if not value or not [tag for tag in value if tag.strip()]:
            raise ValueError("reason_tags must be a non-empty list of strings")
        return value


class DecisionResponse(BaseModel):
    id: int
    candidate_id: int
    decision: Literal["adopt", "hold", "reject"]
    reason_tags: List[str]
    note: Optional[str]
    decided_at: datetime
    rationale_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)  # type: ignore


__all__ = ["DecisionCreate", "DecisionResponse"]
