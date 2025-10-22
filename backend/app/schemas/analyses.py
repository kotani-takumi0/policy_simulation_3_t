from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover
    ConfigDict = dict  # type: ignore


class AnalysisRequest(BaseModel):
    projectName: str
    projectOverview: str
    currentSituation: str
    initialBudget: Optional[float] = Field(default=None)


class AnalysisResponse(BaseModel):
    request_data: AnalysisRequest
    references: list[dict[str, Any]]
    estimated_budget: Optional[float]
    initial_budget: Optional[float]
    history_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class SaveAnalysisRequest(BaseModel):
    projectName: str
    projectOverview: str
    currentSituation: str
    initialBudget: Optional[float] = Field(default=None)
    references: Optional[list[dict[str, Any]]] = None
    estimatedBudget: Optional[float] = Field(default=None)


class HistoryItemResponse(BaseModel):
    id: int
    projectName: Optional[str]
    projectOverview: Optional[str]
    currentSituation: Optional[str]
    initialBudget: Optional[float]
    estimatedBudget: Optional[float]
    createdAt: datetime
    references: list[dict[str, Any]]
    linkedOptionId: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)  # type: ignore


__all__ = [
    "AnalysisRequest",
    "AnalysisResponse",
    "SaveAnalysisRequest",
    "HistoryItemResponse",
]
