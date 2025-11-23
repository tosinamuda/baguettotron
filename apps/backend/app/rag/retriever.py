"""RAG retriever orchestration module."""

import logging
from dataclasses import dataclass
from typing import Optional

from .embeddings import EmbeddingGenerator
from .vector_store import RetrievedChunk, VectorStore

logger = logging.getLogger(__name__)


@dataclass
class RAGContext:
    """RAG context with formatted sources and metadata."""

    formatted_sources: str
    chunks: list[RetrievedChunk]
    query: str


class RAGRetriever:
    """Orchestrates RAG query processing and retrieval.

    This class coordinates the embedding generation and vector search
    to retrieve relevant document chunks for a given query, and formats
    them for use with the Baguettotron model.

    Attributes:
        embedding_generator: EmbeddingGenerator instance for query embeddings
        vector_store: VectorStore instance for similarity search
    """

    def __init__(
        self,
        embedding_generator: EmbeddingGenerator,
        vector_store: VectorStore,
    ):
        """Initialize RAGRetriever.

        Args:
            embedding_generator: EmbeddingGenerator for query embeddings
            vector_store: VectorStore for similarity search
        """
        self.embedding_generator = embedding_generator
        self.vector_store = vector_store

    async def retrieve_context(
        self,
        query: str,
        conversation_id: str,
        top_k: int = 5,
        min_similarity: float = 0.7,
        document_id: Optional[str] = None,
    ) -> Optional[RAGContext]:
        """Retrieve relevant chunks for query.

        This method generates a query embedding, performs similarity search,
        and formats the results for use with the Baguettotron model.

        Args:
            query: User query text
            conversation_id: Conversation ID to filter documents
            top_k: Number of chunks to retrieve (default: 5)
            min_similarity: Minimum similarity threshold (default: 0.7)
            document_id: Optional filter by specific document

        Returns:
            RAGContext with formatted sources or None if no results

        Note:
            Returns None if no chunks are found above the similarity
            threshold, allowing the system to gracefully fall back to
            normal chat without RAG.
        """
        logger.info(
            "Retrieving context for query in conversation %s",
            conversation_id,
        )
        print("[RAG] retriever invoked")
        print(f"   conversation_id={conversation_id}")
        print(f"   query_preview={query[:80].replace(chr(10), ' ')}")
        print(
            f"   top_k={top_k} min_similarity={min_similarity} document_id={document_id}"
        )

        try:
            # Generate query embedding
            query_embedding = self.embedding_generator.generate_embedding(query)

            # Perform similarity search
            chunks = await self.vector_store.similarity_search(
                query_embedding=query_embedding,
                conversation_id=conversation_id,
                top_k=top_k,
                min_similarity=min_similarity,
                document_id=document_id,
            )

            # Handle empty results gracefully
            if not chunks:
                print("[RAG] retriever result: no chunks above threshold")
                logger.info(
                    "No relevant chunks found for query in conversation %s",
                    conversation_id,
                )
                return None

            # Format sources for Baguettotron
            formatted_sources = self.format_sources_for_baguettotron(chunks)

            print(f"[RAG] retriever result: returning {len(chunks)} chunks")
            logger.info(
                "Retrieved %d chunks for query in conversation %s",
                len(chunks),
                conversation_id,
            )

            return RAGContext(
                formatted_sources=formatted_sources,
                chunks=chunks,
                query=query,
            )

        except Exception as e:
            logger.error(
                "Error retrieving context for conversation %s: %s",
                conversation_id,
                str(e),
                exc_info=True,
            )
            # Return None to allow graceful degradation
            return None

    def format_sources_for_baguettotron(self, chunks: list[RetrievedChunk]) -> str:
        """Format retrieved chunks in Baguettotron's XML source format.

        The sources are formatted to be embedded within the user message,
        after the query text. This allows Baguettotron to reference them
        using [quote] syntax in its response.

        Args:
            chunks: List of RetrievedChunk objects

        Returns:
            Formatted string with XML source tags

        Example:
            >>> chunks = [
            ...     RetrievedChunk(text="Paris is the capital of France."),
            ...     RetrievedChunk(text="Paris is in northern France."),
            ... ]
            >>> retriever.format_sources_for_baguettotron(chunks)
            '<source_1>Paris is the capital of France.</source_1>
            <source_2>Paris is in northern France.</source_2>'
        """
        if not chunks:
            return ""

        formatted_parts = []
        for i, chunk in enumerate(chunks, start=1):
            # Format each chunk with source_N tags
            source_tag = f"<source_{i}>{chunk.text}</source_{i}>"
            formatted_parts.append(source_tag)

        # Join with newlines for readability
        return "\n".join(formatted_parts)
