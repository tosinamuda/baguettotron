"""add conversations table and migrate messages"""

from alembic import op
import sqlalchemy as sa


revision = "202511131000"
down_revision = "202501071200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create conversations table
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False, server_default="New Conversation"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_conversations_client_id", "conversations", ["client_id"])
    op.create_index("ix_conversations_last_accessed_at", "conversations", ["last_accessed_at"])

    # Create default conversation for each existing client
    connection = op.get_bind()
    
    # Get all existing clients
    result = connection.execute(sa.text("SELECT id FROM clients"))
    clients = result.fetchall()
    
    # Create a default conversation for each client
    for client in clients:
        connection.execute(
            sa.text("INSERT INTO conversations (client_id, title, created_at, updated_at, last_accessed_at) VALUES (:client_id, 'Chat History', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
            {"client_id": client[0]}
        )
    
    # Add conversation_id column to messages table (nullable initially)
    op.add_column("messages", sa.Column("conversation_id", sa.Integer(), nullable=True))
    
    # Populate conversation_id by linking messages to their client's default conversation
    connection.execute(
        sa.text("""
            UPDATE messages 
            SET conversation_id = (
                SELECT id FROM conversations 
                WHERE conversations.client_id = messages.client_id 
                LIMIT 1
            )
        """)
    )
    
    # Make conversation_id non-nullable
    # SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table
    op.create_table(
        "messages_new",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    # Copy data from old table to new table
    connection.execute(
        sa.text("""
            INSERT INTO messages_new (id, conversation_id, role, content, created_at)
            SELECT id, conversation_id, role, content, created_at
            FROM messages
        """)
    )
    
    # Drop old indexes (check if they exist first)
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('messages')]
    
    if "ix_messages_client_id_created_at" in existing_indexes:
        op.drop_index("ix_messages_client_id_created_at", table_name="messages")
    if "ix_messages_client_id" in existing_indexes:
        op.drop_index("ix_messages_client_id", table_name="messages")
    if "ix_messages_created_at" in existing_indexes:
        op.drop_index("ix_messages_created_at", table_name="messages")
    
    # Drop old table
    op.drop_table("messages")
    
    # Rename new table to messages
    op.rename_table("messages_new", "messages")
    
    # Create indexes on new table
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])


def downgrade() -> None:
    # Recreate messages table with client_id
    op.create_table(
        "messages_old",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    # Copy data back with client_id from conversations
    connection = op.get_bind()
    connection.execute(
        sa.text("""
            INSERT INTO messages_old (id, client_id, role, content, created_at)
            SELECT m.id, c.client_id, m.role, m.content, m.created_at
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
        """)
    )
    
    # Drop current messages table
    op.drop_index("ix_messages_created_at", table_name="messages")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    
    # Rename old table back
    op.rename_table("messages_old", "messages")
    
    # Recreate original index
    op.create_index("ix_messages_client_id_created_at", "messages", ["client_id", "created_at"])
    
    # Drop conversations table
    op.drop_index("ix_conversations_last_accessed_at", table_name="conversations")
    op.drop_index("ix_conversations_client_id", table_name="conversations")
    op.drop_table("conversations")
