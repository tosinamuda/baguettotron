"""Text chunking using LangChain RecursiveCharacterTextSplitter."""

import logging
from dataclasses import dataclass
from typing import Any

from docling.chunking import HybridChunker
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .document_processor import ProcessedDocument

logger = logging.getLogger(__name__)


@dataclass
class TextChunk:
    """Text chunk with metadata."""

    text: str
    chunk_index: int
    metadata: dict[str, Any]


class TextChunker:
    """Chunks text using LangChain RecursiveCharacterTextSplitter."""

    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        separators: list[str] | None = None,
    ):
        """Initialize TextChunker with configuration.

        Args:
            chunk_size: Target size for each chunk in characters
                (default: 512)
            chunk_overlap: Number of characters to overlap between chunks
                (default: 50)
            separators: List of separators to use for splitting
                (default: paragraphs, sentences, characters)
        """
        if separators is None:
            # Default separators: try paragraphs first, then sentences,
            # then characters
            separators = [
                "\n\n",  # Paragraph breaks
                "\n",  # Line breaks
                ". ",  # Sentence endings
                "? ",  # Questions
                "! ",  # Exclamations
                "; ",  # Semi-colons
                ": ",  # Colons
                " ",  # Word boundaries
                "",  # Character-level fallback (last resort)
            ]

        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators

        # Initialize LangChain RecursiveCharacterTextSplitter
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=separators,
            length_function=len,  # Use character count
            is_separator_regex=False,
        )

        # Initialize Docling HybridChunker
        # We use default configuration which respects document structure
        self.hybrid_chunker = HybridChunker(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

        logger.info(
            "TextChunker initialized with chunk_size=%d, "
            "chunk_overlap=%d, separators=%s",
            chunk_size,
            chunk_overlap,
            separators,
        )

    def chunk_document(self, processed_doc: ProcessedDocument) -> list[TextChunk]:
        """Split document into overlapping chunks.

        Args:
            processed_doc: ProcessedDocument with text and metadata

        Returns:
            List of TextChunk with text, index, and metadata

        Raises:
            ValueError: If document text is empty
        """
        if not processed_doc.text or not processed_doc.text.strip():
            raise ValueError(
                f"Document {processed_doc.filename} has no text content to chunk"
            )

        logger.info(
            "Chunking document: %s (%d chars)",
            processed_doc.filename,
            len(processed_doc.text),
        )

        # Use HybridChunker if Docling document is available
        if processed_doc.docling_document:
            logger.info("Using Docling HybridChunker for structured chunking")
            doc_chunks = self.hybrid_chunker.chunk(processed_doc.docling_document)

            # Convert Docling chunks to our TextChunk format
            chunks = []
            for idx, doc_chunk in enumerate(doc_chunks):
                # Docling chunks have text and metadata
                chunk_metadata = {
                    **processed_doc.metadata,
                    "chunk_index": idx,
                    "chunk_size": len(doc_chunk.text),
                    # Add Docling specific metadata if needed
                    # "page_numbers": doc_chunk.meta.page_numbers,
                }

                # Prepend filename to text for better retrieval context
                contextual_text = (
                    f"Document: {processed_doc.filename}\n{doc_chunk.text}"
                )

                chunk = TextChunk(
                    text=contextual_text, chunk_index=idx, metadata=chunk_metadata
                )
                chunks.append(chunk)

            logger.info(
                "Created %d structured chunks from document %s",
                len(chunks),
                processed_doc.filename,
            )
            return chunks

        # Fallback: Split text into chunks using LangChain splitter
        text_chunks = self.splitter.split_text(processed_doc.text)

        # Create TextChunk objects with metadata
        chunks = []
        for idx, chunk_text in enumerate(text_chunks):
            # Inherit metadata from document and add chunk-specific info
            chunk_metadata = {
                **processed_doc.metadata,
                "chunk_index": idx,
                "chunk_size": len(chunk_text),
                "total_chunks": len(text_chunks),
            }

            # Prepend filename to text for better retrieval context
            contextual_text = f"Document: {processed_doc.filename}\n{chunk_text}"
            chunk = TextChunk(
                text=contextual_text, chunk_index=idx, metadata=chunk_metadata
            )
            chunks.append(chunk)

        avg_size = sum(len(c.text) for c in chunks) // len(chunks) if chunks else 0
        logger.info(
            "Created %d chunks from document %s (avg size: %d chars)",
            len(chunks),
            processed_doc.filename,
            avg_size,
        )

        return chunks
