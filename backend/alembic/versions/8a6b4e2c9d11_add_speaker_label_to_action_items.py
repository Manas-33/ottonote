"""add speaker_label to action_items

Revision ID: 8a6b4e2c9d11
Revises: 7f5a3c8d1e02
Create Date: 2026-05-29 11:00:00.000000

Adds the diarized-speaker attribution field used by the trust pass. Nullable
because legacy rows have no attribution and the LLM may also legitimately omit
it when no speaker can be determined.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8a6b4e2c9d11'
down_revision: Union[str, Sequence[str], None] = '7f5a3c8d1e02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'action_items',
        sa.Column('speaker_label', sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('action_items', 'speaker_label')
