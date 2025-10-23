from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import semantic_search
from backend.app.api.routers.auth import router as auth_router
from backend.app.api.routers.analyses import router as analyses_router
from backend.app.api.routers.cases import router as cases_router
from backend.app.api.routers.decisions import router as decisions_router
from backend.app.api.routers.options import router as options_router

app = FastAPI(title="Policy Simulation API", version="1.0.0")

origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://0.0.0.0:5500",
    "null",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(decisions_router)
app.include_router(cases_router)
app.include_router(options_router)
app.include_router(analyses_router)


@app.get("/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
def _load_semantic_data() -> None:
    semantic_search.load_data_and_vectors()
