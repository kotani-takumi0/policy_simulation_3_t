"""add workflow, review, evaluation structures

Revision ID: 20241024_120000
Revises: 20241023_120000
Create Date: 2025-10-24 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241024_120000"
down_revision = "20241023_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)

    option_columns = {col["name"] for col in inspector.get_columns("options")}
    if "status" not in option_columns:
        with op.batch_alter_table("options") as batch_op:
            batch_op.add_column(sa.Column("status", sa.Text(), nullable=False, server_default="draft"))
            if dialect != "sqlite":
                batch_op.create_check_constraint(
                    "ck_options_status",
                    "status IN ('draft','in_review','approved','published','archived')",
                )

    op.create_table(
        "criteria",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("policy_case_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            server_onupdate=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["policy_case_id"], ["policy_cases.id"], name=op.f("fk_criteria_policy_case_id_policy_cases")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_criteria")),
    )

    op.create_table(
        "sources",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credibility", sa.Float(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=True),
        sa.Column(
            "retrieved_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sources")),
        sa.UniqueConstraint("content_hash", name=op.f("uq_sources_content_hash")),
    )

    op.create_table(
        "workflow_transitions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.Text(), nullable=False),
        sa.Column("to_status", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], name=op.f("fk_workflow_transitions_changed_by_users")),
        sa.ForeignKeyConstraint(["option_id"], ["options.id"], name=op.f("fk_workflow_transitions_option_id_options")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workflow_transitions")),
    )

    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_id", sa.Integer(), nullable=False),
        sa.Column("option_version_id", sa.Integer(), nullable=False),
        sa.Column("reviewer_id", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.Text(), server_default="comment", nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "outcome IN ('comment','approve','request_changes')",
            name=op.f("ck_reviews_outcome"),
        ),
        sa.ForeignKeyConstraint(["option_id"], ["options.id"], name=op.f("fk_reviews_option_id_options")),
        sa.ForeignKeyConstraint(
            ["option_version_id"], ["option_versions.id"], name=op.f("fk_reviews_option_version_id_option_versions")
        ),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], name=op.f("fk_reviews_reviewer_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reviews")),
    )

    op.create_table(
        "assessments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_version_id", sa.Integer(), nullable=False),
        sa.Column("criterion_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("assessed_by", sa.Integer(), nullable=True),
        sa.Column(
            "assessed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["assessed_by"], ["users.id"], name=op.f("fk_assessments_assessed_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["criterion_id"], ["criteria.id"], name=op.f("fk_assessments_criterion_id_criteria")
        ),
        sa.ForeignKeyConstraint(
            ["option_version_id"],
            ["option_versions.id"],
            name=op.f("fk_assessments_option_version_id_option_versions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assessments")),
        sa.UniqueConstraint(
            "option_version_id",
            "criterion_id",
            name=op.f("uq_assessments_option_version_criterion"),
        ),
    )

    op.create_table(
        "evidence",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_version_id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("highlight_start", sa.Integer(), nullable=True),
        sa.Column("highlight_end", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_evidence_created_by_users")),
        sa.ForeignKeyConstraint(["option_version_id"], ["option_versions.id"], name=op.f("fk_evidence_option_version_id_option_versions")),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], name=op.f("fk_evidence_source_id_sources")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_evidence")),
    )


def downgrade() -> None:
    op.drop_table("evidence")
    op.drop_table("assessments")
    op.drop_table("reviews")
    op.drop_table("workflow_transitions")
    op.drop_table("sources")
    op.drop_table("criteria")

    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)

    if dialect != "sqlite":
        with op.batch_alter_table("options") as batch_op:
            batch_op.drop_constraint("ck_options_status", type_="check")

    option_columns = {col["name"] for col in inspector.get_columns("options")}
    if "status" in option_columns:
        with op.batch_alter_table("options") as batch_op:
            batch_op.drop_column("status")
