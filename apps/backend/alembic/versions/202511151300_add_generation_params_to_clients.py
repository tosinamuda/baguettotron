"""add_generation_params_to_clients

Revision ID: 202511151300
Revises: 151579317f53
Create Date: 2025-11-15 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '202511151300'
down_revision = '151579317f53'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add generation parameter columns to clients table
    op.add_column('clients', sa.Column('temperature', sa.Float(), nullable=True))
    op.add_column('clients', sa.Column('top_p', sa.Float(), nullable=True))
    op.add_column('clients', sa.Column('top_k', sa.Integer(), nullable=True))
    op.add_column('clients', sa.Column('repetition_penalty', sa.Float(), nullable=True))
    op.add_column('clients', sa.Column('do_sample', sa.Boolean(), nullable=True))
    op.add_column('clients', sa.Column('max_tokens', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove generation parameter columns from clients table
    op.drop_column('clients', 'max_tokens')
    op.drop_column('clients', 'do_sample')
    op.drop_column('clients', 'repetition_penalty')
    op.drop_column('clients', 'top_k')
    op.drop_column('clients', 'top_p')
    op.drop_column('clients', 'temperature')
