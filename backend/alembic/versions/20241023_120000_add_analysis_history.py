"""add analysis_history table

Revision ID: 20241023_120000
Revises: 20241022_120000
Create Date: 2025-10-23 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241023_120000"
down_revision = "20241022_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_name", sa.Text(), nullable=True),
        sa.Column("project_overview", sa.Text(), nullable=True),
        sa.Column("current_situation", sa.Text(), nullable=True),
        sa.Column("initial_budget", sa.Float(), nullable=True),
        sa.Column("estimated_budget", sa.Float(), nullable=True),
        sa.Column("references_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_analysis_history")),
    )


def downgrade() -> None:
    op.drop_table("analysis_history")

