from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base

UTC_NOW = text("CURRENT_TIMESTAMP")


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    users: Mapped[List["User"]] = relationship(
        back_populates="org", cascade="all, delete-orphan"
    )
    sessions: Mapped[List["SessionRecord"]] = relationship(
        back_populates="org", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(back_populates="org")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin','analyst','viewer')",
            name="ck_users_role",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    org: Mapped[Org] = relationship(back_populates="users")
    sessions: Mapped[List["SessionRecord"]] = relationship(back_populates="user")
    decisions: Mapped[List["Decision"]] = relationship(back_populates="decided_by_user")
    audit_logs: Mapped[List["AuditLog"]] = relationship(back_populates="user")


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    org: Mapped[Org] = relationship(back_populates="sessions")
    user: Mapped[Optional[User]] = relationship(back_populates="sessions")
    queries: Mapped[List["Query"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class Query(Base):
    __tablename__ = "queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    session: Mapped[SessionRecord] = relationship(back_populates="queries")
    candidates: Mapped[List["Candidate"]] = relationship(
        back_populates="query", cascade="all, delete-orphan"
    )


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        Index("ix_candidates_query_rank", "query_id", "rank"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("queries.id"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ministry: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    score_bm25: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    score_embed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    score_rrf: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[Optional[str]] = mapped_column("metadata", Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    query: Mapped[Query] = relationship(back_populates="candidates")
    decisions: Mapped[List["Decision"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )


class Decision(Base):
    __tablename__ = "decisions"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('adopt','hold','reject')",
            name="ck_decisions_decision",
        ),
        Index("ix_decisions_candidate_decided_at", "candidate_id", "decided_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"), nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    reason_tags: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    candidate: Mapped[Candidate] = relationship(back_populates="decisions")
    decided_by_user: Mapped[Optional[User]] = relationship(back_populates="decisions")
    rationales: Mapped[List["Rationale"]] = relationship(
        back_populates="decision", cascade="all, delete-orphan"
    )


class Rationale(Base):
    __tablename__ = "rationales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("decisions.id"), nullable=False)
    rationale_text: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_offset_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    evidence_offset_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    decision: Mapped[Decision] = relationship(back_populates="rationales")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    org_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    user: Mapped[Optional[User]] = relationship(back_populates="audit_logs")
    org: Mapped[Optional[Org]] = relationship(back_populates="audit_logs")
