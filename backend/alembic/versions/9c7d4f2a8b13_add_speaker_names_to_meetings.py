"""add speaker_names to meetings

Revision ID: 9c7d4f2a8b13
Revises: 8a6b4e2c9d11
Create Date: 2026-05-29 12:00:00.000000

Per-meeting user-supplied overrides for pyannote's SPEAKER_NN labels.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c7d4f2a8b13'
down_revision: Union[str, Sequence[str], None] = '8a6b4e2c9d11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'meetings',
        sa.Column(
            'speaker_names',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column('meetings', 'speaker_names')
