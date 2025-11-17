"""create clients and messages tables"""

from alembic import op
import sqlalchemy as sa


revision = "202501071200"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fingerprint", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("fingerprint"),
    )
    op.create_index(op.f("ix_clients_fingerprint"), "clients", ["fingerprint"], unique=True)

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_messages_client_id_created_at", "messages", ["client_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_messages_client_id_created_at", table_name="messages")
    op.drop_table("messages")
    op.drop_index(op.f("ix_clients_fingerprint"), table_name="clients")
    op.drop_table("clients")
