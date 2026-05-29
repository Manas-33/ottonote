"""add source_segment_indices to action items, calendar events, and decisions

Revision ID: 7f5a3c8d1e02
Revises: 6e4f1a7b8c92
Create Date: 2026-05-29 09:00:00.000000

Adds the source-anchor field that links extracted items back to the transcript
segments that support them. For decisions (stored as a JSON list on
`summaries.decisions`), the column type doesn't change — but existing rows are
`list[str]` and the new shape is `list[{text, source_segment_indices}]`, so the
data is migrated in-place. Reverse on downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7f5a3c8d1e02'
down_revision: Union[str, Sequence[str], None] = '6e4f1a7b8c92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New columns default to '[]'::jsonb so existing rows are valid without a
    # backfill step.
    op.add_column(
        'action_items',
        sa.Column(
            'source_segment_indices',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        'calendar_events',
        sa.Column(
            'source_segment_indices',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # Migrate summaries.decisions in place: legacy ["a", "b"] becomes
    # [{"text": "a", "source_segment_indices": []}, ...]. We detect legacy
    # rows by checking jsonb_typeof of the first element.
    op.execute(
        """
        UPDATE summaries
        SET decisions = (
            SELECT jsonb_agg(
                jsonb_build_object('text', elem, 'source_segment_indices', '[]'::jsonb)
            )
            FROM jsonb_array_elements_text(decisions::jsonb) AS elem
        )
        WHERE jsonb_typeof(decisions::jsonb) = 'array'
          AND jsonb_array_length(decisions::jsonb) > 0
          AND jsonb_typeof(decisions::jsonb -> 0) = 'string'
        """
    )


def downgrade() -> None:
    # Reverse the decisions migration: pull `.text` back out into a flat list.
    op.execute(
        """
        UPDATE summaries
        SET decisions = (
            SELECT jsonb_agg(elem ->> 'text')
            FROM jsonb_array_elements(decisions::jsonb) AS elem
        )
        WHERE jsonb_typeof(decisions::jsonb) = 'array'
          AND jsonb_array_length(decisions::jsonb) > 0
          AND jsonb_typeof(decisions::jsonb -> 0) = 'object'
        """
    )

    op.drop_column('calendar_events', 'source_segment_indices')
    op.drop_column('action_items', 'source_segment_indices')
