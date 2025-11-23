import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Chunk, Document
from ..db.session import async_session
from ..rag.chunker import TextChunker
from ..rag.config import RAGConfig
from ..rag.document_processor import DocumentProcessor
from ..rag.embeddings import EmbeddingGenerator
from .document_events import broadcast


async def process_document_background(
    document_id: str, file_path: Path, conversation_id: str, filename: str
):
    """
    Background task to process a document: extract text, chunk, embed, and save.
    """
    rag_config = RAGConfig.from_env()
    embedding_generator = (
        EmbeddingGenerator.get_instance(rag_config) if rag_config.enabled else None
    )

    try:
        print(f"[DOC PIPELINE] 🚀 Start processing document {document_id} ({filename})")
        await broadcast(
            document_id,
            {
                "type": "processing_started",
                "document_id": document_id,
                "conversation_id": conversation_id,
                "filename": filename,
            },
        )

        # 1. Initialize processor
        processor = DocumentProcessor.get_instance()

        # 2. Extract text
        processed_doc = await processor.process_document(file_path, filename)
        print(
            f"[DOC PIPELINE] ✅ Docling complete for {document_id} | chars={len(processed_doc.text)} tables={len(processed_doc.tables)}"
        )
        await broadcast(
            document_id,
            {
                "type": "docling_done",
                "document_id": document_id,
                "conversation_id": conversation_id,
                "char_count": len(processed_doc.text),
                "table_count": len(processed_doc.tables),
            },
        )

        # 2.5 Check for duplicates
        async with async_session() as session:
            # Check if document with same hash exists in this conversation
            result = await session.execute(
                select(Document)
                .where(Document.conversation_id == conversation_id)
                .where(Document.content_hash == processed_doc.content_hash)
                .where(Document.status == "ready")
                .where(Document.id != document_id)  # Exclude current doc
            )
            existing_doc = result.scalar_one_or_none()

            if existing_doc:
                print(
                    f"[DOC PIPELINE] ♻️ Duplicate detected: {existing_doc.filename} ({existing_doc.id})"
                )

                # Silent success: Mark as ready but skip processing
                # We copy the chunk count so the UI looks correct
                result = await session.execute(
                    select(Document).where(Document.id == document_id)
                )
                current_doc = result.scalar_one_or_none()
                if current_doc:
                    current_doc.status = "ready"
                    current_doc.chunk_count = existing_doc.chunk_count
                    current_doc.content_hash = processed_doc.content_hash
                    current_doc.error_message = None
                    await session.commit()

                # Broadcast success event so frontend updates normally
                await broadcast(
                    document_id,
                    {
                        "type": "persisted",
                        "document_id": document_id,
                        "conversation_id": conversation_id,
                        "status": "ready",
                        "chunk_count": existing_doc.chunk_count,
                    },
                )
                print(
                    f"[DOC PIPELINE] ⏭️ Skipped processing for duplicate {document_id} -> marked as ready"
                )
                return

        # 3. Chunk text using structured splitter (reduces mid-word splits)
        text_chunker = TextChunker(
            chunk_size=rag_config.chunk_size, chunk_overlap=rag_config.chunk_overlap
        )
        chunks = text_chunker.chunk_document(processed_doc)
        chunks_text = [chunk.text for chunk in chunks]
        print(
            f"[DOC PIPELINE] ✅ Chunking complete for {document_id} | chunks={len(chunks_text)} (avg {sum(len(c) for c in chunks_text) // len(chunks_text) if chunks_text else 0} chars)"
        )
        await broadcast(
            document_id,
            {
                "type": "chunking_done",
                "document_id": document_id,
                "conversation_id": conversation_id,
                "chunk_count": len(chunks_text),
            },
        )

        # 4. Generate embeddings
        if embedding_generator and chunks_text:
            embeddings = embedding_generator.generate_batch_embeddings(chunks_text)
            print(
                f"[DOC PIPELINE] ✅ Embedding complete for {document_id} | vectors={len(embeddings)}"
            )
            await broadcast(
                document_id,
                {
                    "type": "embedding_done",
                    "document_id": document_id,
                    "conversation_id": conversation_id,
                    "vector_count": len(embeddings),
                },
            )
        else:
            embeddings = []
            print(
                f"[DOC PIPELINE] ⚠️ Embedding skipped for {document_id} | reason={'no_embedding_generator' if not embedding_generator else 'no_chunks'}"
            )
            await broadcast(
                document_id,
                {
                    "type": "embedding_skipped",
                    "document_id": document_id,
                    "conversation_id": conversation_id,
                    "reason": "no_embedding_generator"
                    if not embedding_generator
                    else "no_chunks",
                },
            )

        # 5. Save to DB
        async with async_session() as session:
            # Re-fetch document to ensure it's attached to session
            result = await session.execute(
                select(Document).where(Document.id == document_id)
            )
            doc = result.scalar_one_or_none()

            if doc:
                # Create Chunk records
                for i, (chunk_obj, embedding) in enumerate(zip(chunks, embeddings)):
                    chunk_record = Chunk(
                        id=str(uuid.uuid4()),
                        document_id=document_id,
                        chunk_index=i,
                        text=chunk_obj.text,
                        chunk_metadata=json.dumps(chunk_obj.metadata),
                        embedding=embedding.tobytes(),  # Store as bytes
                    )
                    session.add(chunk_record)

                # Update document status
                doc.status = "ready"
                doc.chunk_count = len(chunks_text)
                doc.error_message = None
                doc.content_hash = processed_doc.content_hash

                await session.commit()
                print(
                    f"[DOC PIPELINE] 🎯 Persisted document {document_id} | status=ready chunks={len(chunks_text)}"
                )
                await broadcast(
                    document_id,
                    {
                        "type": "persisted",
                        "document_id": document_id,
                        "conversation_id": conversation_id,
                        "status": "ready",
                        "chunk_count": len(chunks_text),
                    },
                )
            else:
                print(
                    f"[DOC PIPELINE] ❌ Document {document_id} not found in DB during processing"
                )

    except Exception as e:
        print(f"[DOC PIPELINE] ❌ Error processing document {document_id}: {str(e)}")
        async with async_session() as session:
            result = await session.execute(
                select(Document).where(Document.id == document_id)
            )
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = "failed"
                doc.error_message = str(e)
                await session.commit()
            await broadcast(
                document_id,
                {
                    "type": "failed",
                    "document_id": document_id,
                    "conversation_id": conversation_id,
                    "error": str(e),
                },
            )


async def check_conversation_has_documents(
    session: AsyncSession, conversation_id: str
) -> bool:
    """Check if conversation has any ready documents.

    Args:
        session: Database session
        conversation_id: Conversation ID to check

    Returns:
        True if conversation has at least one document with status "ready"
    """
    result = await session.execute(
        select(Document)
        .where(Document.conversation_id == conversation_id)
        .where(Document.status == "ready")
        .limit(1)
    )
    document = result.scalar_one_or_none()
    return document is not None
