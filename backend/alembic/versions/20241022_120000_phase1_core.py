"""phase1 core tables

Revision ID: 20241022_120000
Revises: 20241021_120000
Create Date: 2025-10-22 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241022_120000"
down_revision = "20241021_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "policy_cases",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("background", sa.Text(), nullable=True),
        sa.Column("constraints", sa.Text(), nullable=True),
        sa.Column("kpis", sa.Text(), nullable=True),
        sa.Column("stakeholders", sa.Text(), nullable=True),
        sa.Column("visibility", sa.Text(), server_default="org", nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_policy_cases_created_by_users")),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], name=op.f("fk_policy_cases_org_id_orgs")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_policy_cases")),
        sa.CheckConstraint(
            "visibility IN ('private','org','public')",
            name=op.f("ck_policy_cases_visibility"),
        ),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tags")),
        sa.UniqueConstraint("key", name=op.f("uq_tags_key")),
    )

    op.create_table(
        "options",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("policy_case_id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("visibility", sa.Text(), server_default="org", nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], name=op.f("fk_options_candidate_id_candidates")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_options_created_by_users")),
        sa.ForeignKeyConstraint(["policy_case_id"], ["policy_cases.id"], name=op.f("fk_options_policy_case_id_policy_cases")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_options")),
        sa.CheckConstraint(
            "visibility IN ('private','org','public')",
            name=op.f("ck_options_visibility"),
        ),
    )

    op.create_table(
        "option_versions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_option_versions_created_by_users")),
        sa.ForeignKeyConstraint(["option_id"], ["options.id"], name=op.f("fk_option_versions_option_id_options")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_option_versions")),
        sa.UniqueConstraint(
            "option_id",
            "version_number",
            name=op.f("uq_option_versions_option_version"),
        ),
    )

    op.create_table(
        "decision_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("decision_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("applied_label", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.id"], name=op.f("fk_decision_tags_decision_id_decisions")),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], name=op.f("fk_decision_tags_tag_id_tags")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_decision_tags")),
        sa.UniqueConstraint(
            "decision_id",
            "tag_id",
            name=op.f("uq_decision_tags_decision_tag"),
        ),
    )


def downgrade() -> None:
    op.drop_table("decision_tags")
    op.drop_table("option_versions")
    op.drop_table("options")
    op.drop_table("tags")
    op.drop_table("policy_cases")
