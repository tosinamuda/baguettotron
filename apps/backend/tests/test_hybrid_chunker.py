from unittest.mock import MagicMock

from docling.datamodel.document import DoclingDocument

from app.rag.chunker import TextChunker
from app.rag.document_processor import ProcessedDocument


def test_hybrid_chunker_integration():
    # Mock DoclingDocument
    mock_doc = MagicMock(spec=DoclingDocument)

    # Mock HybridChunker to return dummy chunks
    chunker = TextChunker(chunk_size=500, chunk_overlap=50)

    # Replace the real hybrid_chunker with a mock
    mock_hybrid = MagicMock()
    mock_chunk = MagicMock()
    mock_chunk.text = "Chunk 1 text"
    mock_hybrid.chunk.return_value = [mock_chunk]
    chunker.hybrid_chunker = mock_hybrid

    processed_doc = ProcessedDocument(
        text="Full text",
        metadata={"filename": "test.pdf"},
        tables=[],
        filename="test.pdf",
        content_hash="hash",
        docling_document=mock_doc,
    )

    chunks = chunker.chunk_document(processed_doc)

    assert len(chunks) == 1
    assert chunks[0].text == "Chunk 1 text"
    assert chunks[0].metadata["filename"] == "test.pdf"

    # Verify fallback
    processed_doc_plain = ProcessedDocument(
        text="Plain text content",
        metadata={"filename": "test.txt"},
        tables=[],
        filename="test.txt",
        content_hash="hash",
        docling_document=None,
    )

    chunks_plain = chunker.chunk_document(processed_doc_plain)
    assert len(chunks_plain) > 0
    assert "Plain text" in chunks_plain[0].text
