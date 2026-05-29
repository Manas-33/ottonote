"""add confidence scores to action_items, calendar_events, and decisions

Revision ID: a1b2c3d4e5f6
Revises: 9c7d4f2a8b13
Create Date: 2026-05-29 14:00:00.000000

Adds an LLM-assessed confidence column (0.0–1.0) to action_items and
calendar_events. Existing rows default to 1.0 (assume high confidence for
pre-existing extractions). Decisions live as JSON inside summaries.decisions —
each object gets a `confidence` key added in place.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9c7d4f2a8b13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'action_items',
        sa.Column('confidence', sa.Float(), nullable=False, server_default=sa.text("1.0")),
    )
    op.add_column(
        'calendar_events',
        sa.Column('confidence', sa.Float(), nullable=False, server_default=sa.text("1.0")),
    )

    # Add confidence: 1.0 to each decision object in summaries.decisions.
    # Only touch rows that already have the object shape (post source-segment
    # migration). Rows still in legacy string shape are handled by the app
    # layer's _decisions_out fallback.
    op.execute(
        """
        UPDATE summaries
        SET decisions = (
            SELECT jsonb_agg(
                elem || jsonb_build_object('confidence', 1.0)
            )
            FROM jsonb_array_elements(decisions::jsonb) AS elem
        )
        WHERE jsonb_typeof(decisions::jsonb) = 'array'
          AND jsonb_array_length(decisions::jsonb) > 0
          AND jsonb_typeof(decisions::jsonb -> 0) = 'object'
          AND NOT (decisions::jsonb -> 0 ? 'confidence')
        """
    )


def downgrade() -> None:
    # Strip confidence from decisions JSON objects.
    op.execute(
        """
        UPDATE summaries
        SET decisions = (
            SELECT jsonb_agg(elem - 'confidence')
            FROM jsonb_array_elements(decisions::jsonb) AS elem
        )
        WHERE jsonb_typeof(decisions::jsonb) = 'array'
          AND jsonb_array_length(decisions::jsonb) > 0
          AND jsonb_typeof(decisions::jsonb -> 0) = 'object'
          AND (decisions::jsonb -> 0 ? 'confidence')
        """
    )

    op.drop_column('calendar_events', 'confidence')
    op.drop_column('action_items', 'confidence')
