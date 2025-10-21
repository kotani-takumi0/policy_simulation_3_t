"""initial schema

Revision ID: 20241021_120000
Revises:
Create Date: 2025-10-21 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241021_120000"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orgs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_orgs")),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], name=op.f("fk_users_org_id_orgs")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.CheckConstraint("role IN ('admin','analyst','viewer')", name=op.f("ck_users_role")),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], name=op.f("fk_sessions_org_id_orgs")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_sessions_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
    )

    op.create_table(
        "queries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], name=op.f("fk_queries_session_id_sessions")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_queries")),
    )

    op.create_table(
        "candidates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("query_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("ministry", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("score_bm25", sa.Float(), nullable=True),
        sa.Column("score_embed", sa.Float(), nullable=True),
        sa.Column("score_rrf", sa.Float(), nullable=True),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("metadata", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["query_id"], ["queries.id"], name=op.f("fk_candidates_query_id_queries")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_candidates")),
    )
    op.create_index(
        op.f("ix_candidates_query_rank"),
        "candidates",
        ["query_id", "rank"],
        unique=False,
    )

    op.create_table(
        "decisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("reason_tags", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.Integer(), nullable=True),
        sa.Column(
            "decided_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], name=op.f("fk_decisions_candidate_id_candidates")),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"], name=op.f("fk_decisions_decided_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_decisions")),
        sa.CheckConstraint(
            "decision IN ('adopt','hold','reject')",
            name=op.f("ck_decisions_decision"),
        ),
    )
    op.create_index(
        op.f("ix_decisions_candidate_decided_at"),
        "decisions",
        ["candidate_id", "decided_at"],
        unique=False,
    )

    op.create_table(
        "rationales",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("decision_id", sa.Integer(), nullable=False),
        sa.Column("rationale_text", sa.Text(), nullable=False),
        sa.Column("evidence_snippet", sa.Text(), nullable=True),
        sa.Column("evidence_offset_start", sa.Integer(), nullable=True),
        sa.Column("evidence_offset_end", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.id"], name=op.f("fk_rationales_decision_id_decisions")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rationales")),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], name=op.f("fk_audit_logs_org_id_orgs")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_audit_logs_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("rationales")
    op.drop_index(op.f("ix_decisions_candidate_decided_at"), table_name="decisions")
    op.drop_table("decisions")
    op.drop_index(op.f("ix_candidates_query_rank"), table_name="candidates")
    op.drop_table("candidates")
    op.drop_table("queries")
    op.drop_table("sessions")
    op.drop_table("users")
    op.drop_table("orgs")
