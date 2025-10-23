from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.app.core.config import get_settings

_pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
_settings = get_settings()


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    return _pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    *,
    subject: str | int,
    expires_delta: timedelta | None = None,
) -> str:
    token_subject = str(subject)
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=_settings.access_token_expire_minutes)
    )
    payload: Dict[str, Any] = {"sub": token_subject, "exp": expire}
    return jwt.encode(payload, _settings.jwt_secret_key, algorithm=_settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, _settings.jwt_secret_key, algorithms=[_settings.jwt_algorithm])


__all__ = [
    "hash_password",
    "verify_password",
    "create_access_token",
    "decode_access_token",
    "JWTError",
]
