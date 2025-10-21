from __future__ import annotations

from fastapi import FastAPI

from backend.app.api.routers.cases import router as cases_router
from backend.app.api.routers.decisions import router as decisions_router
from backend.app.api.routers.options import router as options_router

app = FastAPI(title="Policy Simulation API", version="1.0.0")

app.include_router(decisions_router)
app.include_router(cases_router)
app.include_router(options_router)


@app.get("/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
