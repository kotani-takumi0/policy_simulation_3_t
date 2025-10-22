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
    UniqueConstraint,
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
    policy_cases: Mapped[List["PolicyCase"]] = relationship(
        back_populates="org", cascade="all, delete-orphan"
    )


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
    created_policy_cases: Mapped[List["PolicyCase"]] = relationship(
        back_populates="created_by_user"
    )
    created_options: Mapped[List["Option"]] = relationship(
        back_populates="created_by_user"
    )
    created_option_versions: Mapped[List["OptionVersion"]] = relationship(
        back_populates="created_by_user"
    )
    assessments: Mapped[List["Assessment"]] = relationship(back_populates="assessed_by_user")
    evidences: Mapped[List["Evidence"]] = relationship(back_populates="created_by_user")
    reviews: Mapped[List["Review"]] = relationship(back_populates="reviewer")
    workflow_transitions: Mapped[List["WorkflowTransition"]] = relationship(
        back_populates="changed_by_user"
    )


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
    options: Mapped[List["Option"]] = relationship(back_populates="candidate")


class PolicyCase(Base):
    __tablename__ = "policy_cases"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('private','org','public')",
            name="ck_policy_cases_visibility",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    background: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    constraints: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    kpis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stakeholders: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(Text, nullable=False, server_default="org")
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=UTC_NOW,
        server_onupdate=UTC_NOW,
    )

    org: Mapped[Org] = relationship(back_populates="policy_cases")
    created_by_user: Mapped[Optional[User]] = relationship(back_populates="created_policy_cases")
    options: Mapped[List["Option"]] = relationship(
        back_populates="policy_case", cascade="all, delete-orphan"
    )
    criteria: Mapped[List["Criterion"]] = relationship(
        back_populates="policy_case", cascade="all, delete-orphan"
    )


class Option(Base):
    __tablename__ = "options"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('private','org','public')",
            name="ck_options_visibility",
        ),
        CheckConstraint(
            "status IN ('draft','in_review','approved','published','archived')",
            name="ck_options_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    policy_case_id: Mapped[int] = mapped_column(
        ForeignKey("policy_cases.id"), nullable=False
    )
    candidate_id: Mapped[Optional[int]] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(Text, nullable=False, server_default="org")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    analysis_history_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("analysis_history.id"), nullable=True, unique=True
    )
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=UTC_NOW,
        server_onupdate=UTC_NOW,
    )

    policy_case: Mapped[PolicyCase] = relationship(back_populates="options")
    candidate: Mapped[Optional[Candidate]] = relationship(back_populates="options")
    created_by_user: Mapped[Optional[User]] = relationship(back_populates="created_options")
    analysis_history: Mapped[Optional["AnalysisHistory"]] = relationship(
        back_populates="linked_option",
        foreign_keys="Option.analysis_history_id",
    )
    versions: Mapped[List["OptionVersion"]] = relationship(
        back_populates="option", cascade="all, delete-orphan"
    )
    workflow_transitions: Mapped[List["WorkflowTransition"]] = relationship(
        back_populates="option", cascade="all, delete-orphan"
    )
    reviews: Mapped[List["Review"]] = relationship(
        back_populates="option", cascade="all, delete-orphan"
    )


class OptionVersion(Base):
    __tablename__ = "option_versions"
    __table_args__ = (
        UniqueConstraint(
            "option_id",
            "version_number",
            name="uq_option_versions_option_version",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("options.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    option: Mapped[Option] = relationship(back_populates="versions")
    created_by_user: Mapped[Optional[User]] = relationship(back_populates="created_option_versions")
    evidences: Mapped[List["Evidence"]] = relationship(
        back_populates="option_version", cascade="all, delete-orphan"
    )
    assessments: Mapped[List["Assessment"]] = relationship(
        back_populates="option_version", cascade="all, delete-orphan"
    )
    reviews: Mapped[List["Review"]] = relationship(back_populates="option_version")


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
    decision_tags: Mapped[List["DecisionTag"]] = relationship(
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


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=UTC_NOW,
        server_onupdate=UTC_NOW,
    )

    decision_links: Mapped[List["DecisionTag"]] = relationship(
        back_populates="tag", cascade="all, delete-orphan"
    )


class DecisionTag(Base):
    __tablename__ = "decision_tags"
    __table_args__ = (
        UniqueConstraint("decision_id", "tag_id", name="uq_decision_tags_decision_tag"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("decisions.id"), nullable=False)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), nullable=False)
    applied_label: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    decision: Mapped[Decision] = relationship(back_populates="decision_tags")
    tag: Mapped[Tag] = relationship(back_populates="decision_links")


class AnalysisHistory(Base):
    __tablename__ = "analysis_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_overview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_situation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    initial_budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimated_budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    references_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )
    linked_option: Mapped[Optional[Option]] = relationship(
        "Option",
        back_populates="analysis_history",
        uselist=False,
        foreign_keys="Option.analysis_history_id",
    )


class Criterion(Base):
    __tablename__ = "criteria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    policy_case_id: Mapped[int] = mapped_column(ForeignKey("policy_cases.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=UTC_NOW,
        server_onupdate=UTC_NOW,
    )

    policy_case: Mapped[PolicyCase] = relationship(
        back_populates="criteria", cascade="all"
    )
    assessments: Mapped[List["Assessment"]] = relationship(
        back_populates="criterion", cascade="all, delete-orphan"
    )


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        UniqueConstraint(
            "option_version_id",
            "criterion_id",
            name="uq_assessments_option_version_criterion",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    option_version_id: Mapped[int] = mapped_column(ForeignKey("option_versions.id"), nullable=False)
    criterion_id: Mapped[int] = mapped_column(ForeignKey("criteria.id"), nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    option_version: Mapped[OptionVersion] = relationship(back_populates="assessments")
    criterion: Mapped[Criterion] = relationship(back_populates="assessments")
    assessed_by_user: Mapped[Optional[User]] = relationship(back_populates="assessments")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publisher: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    credibility: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    content_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    evidences: Mapped[List["Evidence"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    option_version_id: Mapped[int] = mapped_column(ForeignKey("option_versions.id"), nullable=False)
    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sources.id"), nullable=True)
    snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    highlight_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    highlight_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    option_version: Mapped[OptionVersion] = relationship(back_populates="evidences")
    source: Mapped[Optional[Source]] = relationship(back_populates="evidences")
    created_by_user: Mapped[Optional[User]] = relationship(back_populates="evidences")


class WorkflowTransition(Base):
    __tablename__ = "workflow_transitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("options.id"), nullable=False)
    from_status: Mapped[str] = mapped_column(Text, nullable=False)
    to_status: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    option: Mapped[Option] = relationship(back_populates="workflow_transitions")
    changed_by_user: Mapped[Optional[User]] = relationship(back_populates="workflow_transitions")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint(
            "outcome IN ('comment','approve','request_changes')",
            name="ck_reviews_outcome",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("options.id"), nullable=False)
    option_version_id: Mapped[int] = mapped_column(ForeignKey("option_versions.id"), nullable=False)
    reviewer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    outcome: Mapped[str] = mapped_column(Text, nullable=False, server_default="comment")
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=UTC_NOW
    )

    option: Mapped[Option] = relationship(back_populates="reviews")
    option_version: Mapped[OptionVersion] = relationship(back_populates="reviews")
    reviewer: Mapped[Optional[User]] = relationship(back_populates="reviews")


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
