"""add workspaces

Revision ID: 6e4f1a7b8c92
Revises: 5d3a9b6e2f01
Create Date: 2026-05-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e4f1a7b8c92'
down_revision: Union[str, Sequence[str], None] = '5d3a9b6e2f01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workspaces',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='slate'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_workspaces_user_id'), 'workspaces', ['user_id'], unique=False)
    # At most one default workspace per user. Partial unique index.
    op.create_index(
        'ix_workspaces_user_default',
        'workspaces',
        ['user_id'],
        unique=True,
        postgresql_where=sa.text('is_default = true'),
    )

    op.add_column(
        'meetings',
        sa.Column('workspace_id', sa.UUID(), nullable=True),
    )
    op.create_index(op.f('ix_meetings_workspace_id'), 'meetings', ['workspace_id'], unique=False)
    op.create_foreign_key(
        'fk_meetings_workspace_id',
        'meetings',
        'workspaces',
        ['workspace_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_meetings_workspace_id', 'meetings', type_='foreignkey')
    op.drop_index(op.f('ix_meetings_workspace_id'), table_name='meetings')
    op.drop_column('meetings', 'workspace_id')

    op.drop_index('ix_workspaces_user_default', table_name='workspaces')
    op.drop_index(op.f('ix_workspaces_user_id'), table_name='workspaces')
    op.drop_table('workspaces')
