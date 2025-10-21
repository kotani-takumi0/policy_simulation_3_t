from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import semantic_search
from backend.app.db.deps import get_db
from backend.app.db.models import AnalysisHistory
from backend.app.schemas.analyses import (
    AnalysisRequest,
    AnalysisResponse,
    HistoryItemResponse,
    SaveAnalysisRequest,
)

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None  # type: ignore


router = APIRouter(prefix="/api/v1", tags=["analyses"])

if load_dotenv is not None:  # pragma: no cover - best effort
    env_path = Path(__file__).resolve().parents[3] / "backend" / ".env"
    load_dotenv(env_path)  # type: ignore[arg-type]


def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OPENAI_API_KEY is not configured",
        )
    return OpenAI(api_key=api_key)


def _compute_embedding(client: OpenAI, text: str) -> np.ndarray:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    embedding = response.data[0].embedding
    return np.asarray(embedding, dtype="float32")


def _store_history(
    db: Session,
    *,
    project_name: str,
    project_overview: str,
    current_situation: str,
    initial_budget: float | None,
    estimated_budget: float | None,
    references: list[dict[str, Any]] | None,
) -> int:
    history = AnalysisHistory(
        project_name=project_name,
        project_overview=project_overview,
        current_situation=current_situation,
        initial_budget=initial_budget,
        estimated_budget=estimated_budget,
        references_json=json.dumps(references or [], ensure_ascii=False),
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    return history.id


def _serialize_history(item: AnalysisHistory) -> HistoryItemResponse:
    references: list[dict[str, Any]]
    if item.references_json:
        try:
            loaded = json.loads(item.references_json)
            references = loaded if isinstance(loaded, list) else []
        except json.JSONDecodeError:
            references = []
    else:
        references = []

    return HistoryItemResponse(
        id=item.id,
        projectName=item.project_name,
        projectOverview=item.project_overview,
        currentSituation=item.current_situation,
        initialBudget=item.initial_budget,
        estimatedBudget=item.estimated_budget,
        createdAt=item.created_at,
        references=references,
    )


@router.post("/analyses", response_model=AnalysisResponse)
def create_analysis(payload: AnalysisRequest, db: Session = Depends(get_db)) -> AnalysisResponse:
    client = _get_openai_client()
    try:
        query_vec_overview = _compute_embedding(client, payload.projectOverview)
        query_vec_situation = _compute_embedding(client, payload.currentSituation)
    except Exception as exc:  # pragma: no cover - network / client errors
        raise HTTPException(status_code=500, detail=f"Failed to compute embeddings: {exc}") from exc

    try:
        result = semantic_search.analyze_similarity(query_vec_overview, query_vec_situation)
    except Exception as exc:  # pragma: no cover - semantic search errors
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    references = result.get("similar_projects", []) if isinstance(result, dict) else []
    estimated_budget = result.get("predicted_budget") if isinstance(result, dict) else None

    initial_budget = payload.initialBudget if payload.initialBudget is not None else None
    history_id = _store_history(
        db,
        project_name=payload.projectName,
        project_overview=payload.projectOverview,
        current_situation=payload.currentSituation,
        initial_budget=initial_budget,
        estimated_budget=estimated_budget,
        references=references,
    )

    response = AnalysisResponse(
        request_data=payload,
        references=references,
        estimated_budget=estimated_budget,
        initial_budget=initial_budget,
        history_id=history_id,
    )
    return response


@router.post("/save_analysis", response_model=dict)
def save_analysis(payload: SaveAnalysisRequest, db: Session = Depends(get_db)) -> dict[str, int]:
    references = payload.references or []
    history_id = _store_history(
        db,
        project_name=payload.projectName,
        project_overview=payload.projectOverview,
        current_situation=payload.currentSituation,
        initial_budget=payload.initialBudget,
        estimated_budget=payload.estimatedBudget,
        references=references,
    )
    return {"status": "success", "id": history_id}


@router.get("/history", response_model=list[HistoryItemResponse])
def list_history(limit: int = 100, db: Session = Depends(get_db)) -> list[HistoryItemResponse]:
    stmt = (
        select(AnalysisHistory)
        .order_by(AnalysisHistory.id.desc())
        .limit(max(limit, 1))
    )
    records = db.execute(stmt).scalars().all()
    return [_serialize_history(record) for record in records]


@router.delete("/history/{history_id}", response_model=dict)
def delete_history(history_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    history = db.get(AnalysisHistory, history_id)
    if history is None:
        raise HTTPException(status_code=404, detail="指定されたログは存在しません")
    db.delete(history)
    db.commit()
    return {"status": "success"}


__all__ = ["router"]
