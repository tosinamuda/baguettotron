"""add RAG documents and chunks tables

Revision ID: 202511191400
Revises: 202511151300
Create Date: 2025-11-19 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '202511191400'
down_revision = '202511151300'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable sqlite-vec extension
    connection = op.get_bind()
    try:
        connection.execute(sa.text("SELECT load_extension('vec0')"))
    except Exception as e:
        # Extension might not be available or already loaded
        print(f"Note: Could not load sqlite-vec extension: {e}")
    
    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('conversation_id', sa.String(length=36), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_path', sa.String(length=512), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('chunk_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('upload_timestamp', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_conversation_id'), 'documents', ['conversation_id'], unique=False)
    
    # Create chunks table
    op.create_table(
        'chunks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('document_id', sa.String(length=36), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('chunk_metadata', sa.Text(), nullable=False),
        sa.Column('embedding', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chunks_document_id'), 'chunks', ['document_id'], unique=False)
    op.create_index('idx_document_chunk', 'chunks', ['document_id', 'chunk_index'], unique=False)


def downgrade() -> None:
    # Drop chunks table
    op.drop_index('idx_document_chunk', table_name='chunks')
    op.drop_index(op.f('ix_chunks_document_id'), table_name='chunks')
    op.drop_table('chunks')
    
    # Drop documents table
    op.drop_index(op.f('ix_documents_conversation_id'), table_name='documents')
    op.drop_table('documents')
