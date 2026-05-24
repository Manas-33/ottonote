"""add progress_step to meetings

Revision ID: 5d3a9b6e2f01
Revises: 4b2c8e1f5a7d
Create Date: 2026-05-23 19:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5d3a9b6e2f01'
down_revision: Union[str, Sequence[str], None] = '4b2c8e1f5a7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'meetings',
        sa.Column('progress_step', sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('meetings', 'progress_step')
