from typing import List

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from ...db.conversation_helpers import (
    update_conversation_access_time,
    verify_conversation_belongs_to_client,
)
from ...db.models import Conversation, Message
from ...db.session import async_session
from ...services.model_utils import get_or_create_client
from ...schemas import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationResponse,
    ConversationUpdate,
    MessageResponse,
)

router = APIRouter()


@router.get("/api/conversations", response_model=List[ConversationResponse])
async def list_conversations(client_id: str = Query(...)):
    """List all conversations for a client."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversations with message count
            result = await session.execute(
                select(Conversation, func.count(Message.id).label("message_count"))
                .outerjoin(Message, Message.conversation_id == Conversation.id)
                .where(Conversation.client_id == client.id)
                .group_by(Conversation.id)
                .order_by(Conversation.last_accessed_at.desc())
            )

            conversations = []
            for conversation, message_count in result.all():
                conversations.append(
                    ConversationResponse(
                        id=conversation.id,
                        title=conversation.title,
                        created_at=conversation.created_at.isoformat(),
                        updated_at=conversation.updated_at.isoformat(),
                        last_accessed_at=conversation.last_accessed_at.isoformat(),
                        message_count=message_count,
                    )
                )

            return conversations
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@router.post("/api/conversations", response_model=ConversationResponse)
async def create_conversation(conversation_data: ConversationCreate):
    """Create a new conversation."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, conversation_data.client_id)

            # Create new conversation with UUID from frontend
            conversation = Conversation(
                id=conversation_data.id,
                client_id=client.id,
                title=conversation_data.title,
            )
            session.add(conversation)
            await session.commit()
            await session.refresh(conversation)

            return ConversationResponse(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
                last_accessed_at=conversation.last_accessed_at.isoformat(),
                message_count=0,
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@router.get(
    "/api/conversations/{conversation_id}", response_model=ConversationDetailResponse
)
async def get_conversation(conversation_id: str, client_id: str = Query(...)):
    """Get conversation details with messages."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversation
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")

            # Verify ownership
            if conversation.client_id != client.id:
                raise HTTPException(
                    status_code=403,
                    detail="Conversation does not belong to this client",
                )

            # Fetch messages
            messages_result = await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at, Message.id)
            )
            messages = messages_result.scalars().all()

            return ConversationDetailResponse(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
                last_accessed_at=conversation.last_accessed_at.isoformat(),
                messages=[
                    MessageResponse(
                        role=msg.role,
                        content=msg.content,
                        thinking=msg.thinking,
                        created_at=msg.created_at.isoformat(),
                    )
                    for msg in messages
                ],
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@router.patch(
    "/api/conversations/{conversation_id}", response_model=ConversationResponse
)
async def update_conversation(
    conversation_id: str,
    conversation_data: ConversationUpdate,
    client_id: str = Query(...),
):
    """Update conversation title."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversation
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")

            # Verify ownership
            if conversation.client_id != client.id:
                raise HTTPException(
                    status_code=403,
                    detail="Conversation does not belong to this client",
                )

            # Update title
            conversation.title = conversation_data.title
            await session.commit()
            await session.refresh(conversation)

            # Get message count
            count_result = await session.execute(
                select(func.count(Message.id)).where(
                    Message.conversation_id == conversation_id
                )
            )
            message_count = count_result.scalar()

            return ConversationResponse(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
                last_accessed_at=conversation.last_accessed_at.isoformat(),
                message_count=message_count,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, client_id: str = Query(...)):
    """Delete conversation and cascade delete messages."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversation
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")

            # Verify ownership
            if conversation.client_id != client.id:
                raise HTTPException(
                    status_code=403,
                    detail="Conversation does not belong to this client",
                )

            # Delete conversation (cascade will delete messages)
            await session.delete(conversation)
            await session.commit()

            return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@router.post("/api/conversations/{conversation_id}/access")
async def update_conversation_access(conversation_id: str, client_id: str = Query(...)):
    """Update last_accessed_at timestamp."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Verify conversation exists and belongs to client
            if not await verify_conversation_belongs_to_client(
                session, conversation_id, client.id
            ):
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found or does not belong to this client",
                )

            # Update access time
            await update_conversation_access_time(session, conversation_id)

            return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")
