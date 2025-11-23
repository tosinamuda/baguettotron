"""Vector store operations using sqlite-vec."""

import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Chunk, Document
from .chunker import TextChunk

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    """Retrieved chunk with similarity score."""

    chunk_id: str
    document_id: str
    text: str
    metadata: dict[str, Any]
    similarity_score: float
    chunk_index: int


class VectorStore:
    """Manages vector storage and similarity search using sqlite-vec.

    This class handles storing document chunks with their embeddings
    and performing cosine similarity search for RAG retrieval.

    Attributes:
        session: SQLAlchemy async session for database operations
    """

    def __init__(self, session: AsyncSession):
        """Initialize VectorStore with database session.

        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def store_document_chunks(
        self,
        document_id: str,
        chunks: list[TextChunk],
        embeddings: np.ndarray,
    ) -> int:
        """Store chunks and embeddings in database.

        Args:
            document_id: UUID of the parent document
            chunks: List of TextChunk objects
            embeddings: Numpy array of shape (len(chunks), dimension)

        Returns:
            Number of chunks stored

        Raises:
            ValueError: If chunks and embeddings length mismatch
        """
        if len(chunks) != len(embeddings):
            raise ValueError(
                f"Chunks count ({len(chunks)}) does not match "
                f"embeddings count ({len(embeddings)})"
            )

        logger.info("Storing %d chunks for document %s", len(chunks), document_id)

        # Create Chunk records
        chunk_records = []
        for chunk, embedding in zip(chunks, embeddings):
            chunk_id = str(uuid.uuid4())

            # Serialize embedding to bytes
            embedding_bytes = embedding.astype(np.float32).tobytes()

            # Serialize metadata to JSON
            metadata_json = json.dumps(chunk.metadata)

            chunk_record = Chunk(
                id=chunk_id,
                document_id=document_id,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                chunk_metadata=metadata_json,
                embedding=embedding_bytes,
            )
            chunk_records.append(chunk_record)

        # Add all chunks to session
        self.session.add_all(chunk_records)
        await self.session.flush()

        # Commit is handled by caller
        logger.info(
            "Successfully stored %d chunks for document %s",
            len(chunk_records),
            document_id,
        )

        return len(chunk_records)

    async def similarity_search(
        self,
        query_embedding: np.ndarray,
        conversation_id: str,
        top_k: int = 5,
        min_similarity: float = 0.7,
        document_id: Optional[str] = None,
    ) -> list[RetrievedChunk]:
        """Perform cosine similarity search.

        Args:
            query_embedding: Query vector of shape (dimension,)
            conversation_id: Limit to conversation's documents
            top_k: Number of results to return (default: 5)
            min_similarity: Minimum similarity threshold (default: 0.7)
            document_id: Optional filter by specific document

        Returns:
            List of RetrievedChunk with text, metadata, similarity score

        Note:
            Cosine similarity is computed as 1 - cosine_distance.
            Results are filtered by min_similarity and limited to top_k.
        """
        logger.info(
            "Performing similarity search for conversation %s "
            "(top_k=%d, min_similarity=%.2f, document_id=%s)",
            conversation_id,
            top_k,
            min_similarity,
            document_id,
        )

        # Build query with manual cosine similarity calculation
        # Since sqlite-vec might not be available, we'll compute
        # similarity in Python
        query_stmt = (
            select(Chunk, Document.conversation_id)
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.conversation_id == conversation_id)
        )

        if document_id:
            query_stmt = query_stmt.where(Document.id == document_id)

        result = await self.session.execute(query_stmt)
        rows = result.all()

        if not rows:
            logger.info("No chunks found for conversation %s", conversation_id)
            return []

        # Compute cosine similarity for each chunk
        candidates: list[RetrievedChunk] = []
        all_candidates: list[RetrievedChunk] = []
        for chunk, _ in rows:
            # Deserialize embedding from bytes
            chunk_embedding = np.frombuffer(chunk.embedding, dtype=np.float32)

            # Compute cosine similarity
            similarity = self._cosine_similarity(query_embedding, chunk_embedding)
            # Deserialize metadata (needed for debug + potential fallback)
            metadata = json.loads(chunk.chunk_metadata)

            retrieved_chunk = RetrievedChunk(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                text=chunk.text,
                metadata=metadata,
                similarity_score=similarity,
                chunk_index=chunk.chunk_index,
            )
            all_candidates.append(retrieved_chunk)

            # Filter by minimum similarity for primary results
            if similarity >= min_similarity:
                candidates.append(retrieved_chunk)

        # Log top similarities even if they are below the threshold to aid debugging
        all_candidates.sort(key=lambda x: x.similarity_score, reverse=True)
        if all_candidates:
            top_preview = all_candidates[: min(3, len(all_candidates))]
            print(
                "[RAG] similarity debug: top scores (similarity, chunk_id, idx, doc_id, text_preview)"
            )
            for rc in top_preview:
                preview = rc.text[:80].replace("\n", " ")
                print(
                    f"   {rc.similarity_score:.4f} | {rc.chunk_id} | chunk#{rc.chunk_index} | doc:{rc.document_id} | {preview}"
                )
        else:
            print("[RAG] similarity debug: no chunks found to score")

        fallback_used = False
        # Degrade gracefully: if nothing cleared the threshold but we have candidates,
        # return the top_k lowest-threshold chunks so the model still sees context.
        if not candidates and all_candidates:
            print(
                f"[RAG] similarity debug: no chunks >= {min_similarity}, falling back to top {top_k} results"
            )
            candidates = all_candidates[:top_k]
            fallback_used = True

        # Sort by similarity (descending) and limit to top_k
        candidates.sort(key=lambda x: x.similarity_score, reverse=True)
        results = candidates[:top_k]

        if fallback_used:
            logger.info(
                "Fell back to top_%d chunks (threshold %.2f not met) from %d total chunks",
                len(results),
                min_similarity,
                len(rows),
            )
        else:
            logger.info(
                "Found %d chunks above threshold (%.2f) from %d total chunks",
                len(results),
                min_similarity,
                len(rows),
            )

        return results

    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute cosine similarity between two vectors.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity in range [-1, 1]
        """
        # Normalize vectors
        vec1_norm = vec1 / (np.linalg.norm(vec1) + 1e-10)
        vec2_norm = vec2 / (np.linalg.norm(vec2) + 1e-10)

        # Compute dot product
        similarity = np.dot(vec1_norm, vec2_norm)

        return float(similarity)
