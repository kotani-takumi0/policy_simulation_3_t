"""add password and auth metadata to users

Revision ID: 20241024_140000
Revises: 20241024_130000
Create Date: 2025-10-24 14:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241024_140000"
down_revision = "20241024_130000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("users")}

    with op.batch_alter_table("users") as batch_op:
        if "password_hash" not in existing_columns:
            batch_op.add_column(sa.Column("password_hash", sa.Text(), nullable=True))
        if "is_active" not in existing_columns:
            batch_op.add_column(
                sa.Column(
                    "is_active",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("1"),
                )
            )
        if "last_login_at" not in existing_columns:
            batch_op.add_column(
                sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True)
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("users")}

    with op.batch_alter_table("users") as batch_op:
        if "last_login_at" in existing_columns:
            batch_op.drop_column("last_login_at")
        if "is_active" in existing_columns:
            batch_op.drop_column("is_active")
        if "password_hash" in existing_columns:
            batch_op.drop_column("password_hash")
