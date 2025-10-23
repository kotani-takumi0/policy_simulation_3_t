from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover
    ConfigDict = dict  # type: ignore


class UserResponse(BaseModel):
    id: int
    org_id: int
    email: str
    role: Literal["admin", "analyst", "viewer"]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)  # type: ignore


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)


class RegisterRequest(BaseModel):
    org_name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=8)
    role: Literal["admin", "analyst", "viewer"] = "analyst"


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserResponse


__all__ = [
    "LoginRequest",
    "RegisterRequest",
    "TokenResponse",
    "UserResponse",
]
