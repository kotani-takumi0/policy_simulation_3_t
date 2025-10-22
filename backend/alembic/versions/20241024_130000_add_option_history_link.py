"""link options to analysis history

Revision ID: 20241024_130000
Revises: 20241024_120000
Create Date: 2025-10-24 13:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241024_130000"
down_revision = "20241024_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("options")}

    with op.batch_alter_table("options") as batch_op:
        if "analysis_history_id" not in columns:
            batch_op.add_column(sa.Column("analysis_history_id", sa.Integer(), nullable=True))
        existing_uqs = {uq["name"] for uq in inspector.get_unique_constraints("options")}
        if "uq_options_analysis_history_id" not in existing_uqs:
            batch_op.create_unique_constraint(
                "uq_options_analysis_history_id",
                ["analysis_history_id"],
            )
        existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("options")}
        if "fk_options_analysis_history_id" not in existing_fks:
            batch_op.create_foreign_key(
                "fk_options_analysis_history_id",
                "analysis_history",
                ["analysis_history_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("options")}
    existing_uqs = {uq["name"] for uq in inspector.get_unique_constraints("options")}
    columns = {col["name"] for col in inspector.get_columns("options")}

    with op.batch_alter_table("options") as batch_op:
        if "fk_options_analysis_history_id" in existing_fks:
            batch_op.drop_constraint("fk_options_analysis_history_id", type_="foreignkey")
        if "uq_options_analysis_history_id" in existing_uqs:
            batch_op.drop_constraint("uq_options_analysis_history_id", type_="unique")
        if "analysis_history_id" in columns:
            batch_op.drop_column("analysis_history_id")
