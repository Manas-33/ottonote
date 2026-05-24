"""add tldr to summaries

Revision ID: 4b2c8e1f5a7d
Revises: 3a1f2b9c4d5e
Create Date: 2026-05-23 18:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4b2c8e1f5a7d'
down_revision: Union[str, Sequence[str], None] = '3a1f2b9c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('summaries', sa.Column('tldr', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('summaries', 'tldr')
