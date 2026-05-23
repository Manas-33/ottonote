"""add task_id to meetings

Revision ID: 3a1f2b9c4d5e
Revises: 02b2b60f7ddb
Create Date: 2026-05-22 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3a1f2b9c4d5e'
down_revision: Union[str, Sequence[str], None] = '02b2b60f7ddb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('meetings', sa.Column('task_id', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('meetings', 'task_id')
