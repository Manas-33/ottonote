"""add verified column to action_items and calendar_events

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29 15:00:00.000000

Nullable boolean: null = not checked (high-confidence, skipped verification),
true = confirmed by second LLM pass, false = flagged as potentially
hallucinated. Decisions get the same field in their JSON objects.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'action_items',
        sa.Column('verified', sa.Boolean(), nullable=True),
    )
    op.add_column(
        'calendar_events',
        sa.Column('verified', sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('calendar_events', 'verified')
    op.drop_column('action_items', 'verified')
