import asyncio
import json
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import select

from ...db.conversation_helpers import verify_conversation_belongs_to_client
from ...db.models import Document
from ...db.session import async_session
from ...services.model_utils import get_or_create_client
from ...rag.config import RAGConfig
from ...schemas import DocumentResponse
from ...services.document_events import (
    broadcast,
    get_history,
    subscribe,
    unsubscribe,
)
from ...services.document_service import process_document_background

router = APIRouter()


@router.post(
    "/api/conversations/{conversation_id}/documents", response_model=DocumentResponse
)
async def upload_document(
    conversation_id: str, client_id: str = Query(...), file: UploadFile = File(...)
):
    """
    Upload and process a document for RAG.

    Args:
        conversation_id: ID of the conversation to attach document to
        client_id: Client fingerprint for ownership verification
        file: Uploaded file

    Returns:
        DocumentResponse with document metadata
    """
    try:
        # Load RAG configuration
        rag_config = RAGConfig.from_env()

        # Validate file type
        allowed_extensions = {".pdf", ".docx", ".txt", ".md"}
        file_ext = Path(file.filename).suffix.lower() if file.filename else ""
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}",
            )

        # Validate file size
        file.file.seek(0, 2)  # Seek to end
        file_size_mb = file.file.tell() / (1024 * 1024)
        file.file.seek(0)  # Reset to beginning

        if file_size_mb > rag_config.max_file_size_mb:
            raise HTTPException(
                status_code=400,
                detail=f"File size ({file_size_mb:.1f}MB) exceeds maximum allowed size ({rag_config.max_file_size_mb}MB)",
            )

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

            # Generate UUID for document
            document_id = str(uuid.uuid4())

            # Create upload directory if it doesn't exist
            rag_config.upload_dir.mkdir(parents=True, exist_ok=True)

            # Save file with UUID-based filename
            file_path = rag_config.upload_dir / f"{document_id}{file_ext}"
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)

            # Create Document record with "processing" status
            document = Document(
                id=document_id,
                conversation_id=conversation_id,
                filename=file.filename or f"document{file_ext}",
                original_path=str(file_path),
                status="processing",
                chunk_count=0,
            )
            session.add(document)
            await session.commit()
            await session.refresh(document)

            # Notify any SSE listeners that processing has started
            await broadcast(
                document_id,
                {
                    "type": "upload_received",
                    "document_id": document_id,
                    "conversation_id": conversation_id,
                    "filename": document.filename,
                    "status": "processing",
                },
            )

            # Trigger async document processing pipeline
            asyncio.create_task(
                process_document_background(
                    document_id,
                    file_path,
                    conversation_id,
                    file.filename or f"document{file_ext}",
                )
            )

            return DocumentResponse(
                id=document.id,
                conversation_id=document.conversation_id,
                filename=document.filename,
                status=document.status,
                chunk_count=document.chunk_count,
                upload_timestamp=document.upload_timestamp.isoformat(),
                error_message=document.error_message,
                sse_url=f"/api/conversations/{conversation_id}/documents/{document_id}/events?client_id={client_id}",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get(
    "/api/conversations/{conversation_id}/documents",
    response_model=List[DocumentResponse],
)
async def list_documents(conversation_id: str, client_id: str = Query(...)):
    """
    List all documents for a conversation.
    """
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

            # Fetch documents
            result = await session.execute(
                select(Document)
                .where(Document.conversation_id == conversation_id)
                .order_by(Document.upload_timestamp.desc())
            )
            documents = result.scalars().all()

            return [
                DocumentResponse(
                    id=doc.id,
                    conversation_id=doc.conversation_id,
                    filename=doc.filename,
                    status=doc.status,
                    chunk_count=doc.chunk_count,
                    upload_timestamp=doc.upload_timestamp.isoformat(),
                    error_message=doc.error_message,
                    sse_url=f"/api/conversations/{conversation_id}/documents/{doc.id}/events?client_id={client_id}",
                )
                for doc in documents
            ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@router.get("/api/conversations/{conversation_id}/documents/{document_id}/events")
async def stream_document_events(
    conversation_id: str,
    document_id: str,
    request: Request,
    client_id: str = Query(...),
):
    """
    Server-Sent Events stream for a single document's processing stages.

    Emits events:
    - upload_received
    - docling_done
    - chunking_done
    - embedding_done
    - persisted (ready)
    - failed
    - heartbeat (periodic keep-alive)
    """
    from fastapi.responses import StreamingResponse

    # Verify ownership
    async with async_session() as session:
        client = await get_or_create_client(session, client_id)
        if not await verify_conversation_belongs_to_client(
            session, conversation_id, client.id
        ):
            raise HTTPException(status_code=404, detail="Conversation not found")
        result = await session.execute(
            select(Document).where(
                Document.id == document_id,
                Document.conversation_id == conversation_id,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

    async def event_stream(request_obj: Request):
        queue = await subscribe(document_id)
        try:
            # Send initial snapshot
            yield f"data: {json.dumps({'type': 'status', 'status': doc.status, 'document_id': document_id, 'chunk_count': doc.chunk_count, 'filename': doc.filename, 'conversation_id': conversation_id})}\n\n"
            # Replay recent history so clients see stage events even if they subscribe late
            for ev in get_history(document_id):
                yield f"data: {json.dumps(ev)}\n\n"
            while True:
                if await request_obj.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    event = {"type": "heartbeat", "document_id": document_id}
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            unsubscribe(document_id, queue)

    return StreamingResponse(
        event_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
