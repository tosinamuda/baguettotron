"""Helper functions for conversation management."""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Conversation


async def get_or_create_default_conversation(
    session: AsyncSession, client_id: int
) -> Conversation:
    """
    Get the most recent conversation or create a new one if none exist.

    Args:
        session: Database session
        client_id: ID of the client

    Returns:
        The most recent conversation or a newly created one
    """
    result = await session.execute(
        select(Conversation)
        .where(Conversation.client_id == client_id)
        .order_by(Conversation.last_accessed_at.desc())
        .limit(1)
    )
    conversation = result.scalar_one_or_none()

    if conversation is None:
        conversation = Conversation(client_id=client_id, title="New Conversation")
        session.add(conversation)
        await session.flush()

    return conversation


async def update_conversation_access_time(
    session: AsyncSession, conversation_id: str
) -> None:
    """
    Update the last_accessed_at timestamp for a conversation.

    Args:
        session: Database session
        conversation_id: ID of the conversation to update
    """
    from sqlalchemy import text

    await session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(last_accessed_at=text("CURRENT_TIMESTAMP"))
    )
    await session.commit()


def generate_conversation_title(first_message: str, max_length: int = 50) -> str:
    """
    Generate a title from the first user message.

    Args:
        first_message: The first message content
        max_length: Maximum length of the title (default: 50)

    Returns:
        A truncated title string
    """
    title = first_message.strip()
    if len(title) > max_length:
        # Truncate at word boundary
        title = title[:max_length].rsplit(" ", 1)[0] + "..."
    return title or "New Conversation"


async def verify_conversation_belongs_to_client(
    session: AsyncSession, conversation_id: str, client_id: int
) -> bool:
    """
    Verify that a conversation belongs to a specific client.

    Args:
        session: Database session
        conversation_id: ID of the conversation
        client_id: ID of the client

    Returns:
        True if the conversation belongs to the client, False otherwise
    """
    result = await session.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.client_id == client_id
        )
    )
    conversation = result.scalar_one_or_none()
    return conversation is not None
