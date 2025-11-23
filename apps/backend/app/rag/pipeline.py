"""Document processing pipeline.

This module orchestrates the complete RAG document processing flow:
1. Extract text from document using DocumentProcessor
2. Chunk text using TextChunker
3. Generate embeddings using EmbeddingGenerator
4. Store chunks and embeddings using VectorStore
5. Update document status to "ready" or "failed"
"""

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Document
from .chunker import TextChunker
from .config import RAGConfig
from .document_processor import DocumentProcessor
from .embeddings import EmbeddingGenerator
from .vector_store import VectorStore

logger = logging.getLogger(__name__)


async def process_document_async(
    document_id: str,
    file_path: Path,
    filename: str,
    session: AsyncSession,
    config: Optional[RAGConfig] = None,
) -> None:
    """Process document asynchronously through the RAG pipeline.

    This function orchestrates the complete document processing flow:
    1. Extract text and metadata from the document
    2. Chunk the text into manageable pieces
    3. Generate embeddings for each chunk
    4. Store chunks and embeddings in the vector store
    5. Update document status to "ready" on success or "failed" on error

    Args:
        document_id: UUID of the document record in database
        file_path: Path to the uploaded document file
        filename: Original filename of the document
        session: SQLAlchemy async session for database operations
        config: RAG configuration (loads from env if None)

    Raises:
        Exception: Any exception during processing is caught, logged,
                   and stored in the document's error_message field
    """
    if config is None:
        config = RAGConfig.from_env()

    logger.info(
        "Starting document processing pipeline for document %s (%s)",
        document_id,
        filename,
    )

    try:
        # Step 1: Extract text from document
        logger.info("Step 1/4: Extracting text from document")
        document_processor = DocumentProcessor()
        processed_doc = await document_processor.process_document(file_path, filename)
        logger.info("Extracted %d characters from document", len(processed_doc.text))

        # Step 2: Chunk the text
        logger.info("Step 2/4: Chunking document text")
        text_chunker = TextChunker(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap,
        )
        chunks = text_chunker.chunk_document(processed_doc)
        logger.info("Created %d chunks from document", len(chunks))

        # Step 3: Generate embeddings
        logger.info("Step 3/4: Generating embeddings for chunks")
        embedding_generator = EmbeddingGenerator.get_instance(config)
        chunk_texts = [chunk.text for chunk in chunks]
        embeddings = embedding_generator.generate_batch_embeddings(chunk_texts)
        logger.info("Generated embeddings with shape %s", embeddings.shape)

        # Step 4: Store chunks and embeddings
        logger.info("Step 4/4: Storing chunks in vector store")
        vector_store = VectorStore(session)
        chunk_count = await vector_store.store_document_chunks(
            document_id, chunks, embeddings
        )
        logger.info("Stored %d chunks in vector store", chunk_count)

        # Update document status to "ready"
        stmt = select(Document).where(Document.id == document_id)
        result = await session.execute(stmt)
        document = result.scalar_one_or_none()

        if document:
            document.status = "ready"
            document.chunk_count = chunk_count
            document.error_message = None
            await session.commit()
            logger.info("Document %s processing completed successfully", document_id)
        else:
            logger.error(
                "Document %s not found in database after processing",
                document_id,
            )

    except Exception as e:
        # Log the error
        logger.error(
            "Error processing document %s: %s",
            document_id,
            str(e),
            exc_info=True,
        )

        # Update document status to "failed" with error message
        try:
            stmt = select(Document).where(Document.id == document_id)
            result = await session.execute(stmt)
            document = result.scalar_one_or_none()

            if document:
                document.status = "failed"
                document.error_message = str(e)
                await session.commit()
                logger.info(
                    "Document %s marked as failed with error: %s",
                    document_id,
                    str(e),
                )
            else:
                logger.error(
                    "Document %s not found in database during error handling",
                    document_id,
                )

        except Exception as cleanup_error:
            logger.error(
                "Error during cleanup for document %s: %s",
                document_id,
                str(cleanup_error),
                exc_info=True,
            )

        # Re-raise the exception so caller can handle it
        raise
