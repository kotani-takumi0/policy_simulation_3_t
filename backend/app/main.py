from __future__ import annotations

from fastapi import FastAPI

from backend.app.api.routers.decisions import router as decisions_router

app = FastAPI(title="Policy Simulation API", version="1.0.0")

app.include_router(decisions_router)


@app.get("/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
