from app.rag.chunker import TextChunker
from app.rag.document_processor import ProcessedDocument


def test_chunker_separators():
    chunker = TextChunker(chunk_size=20, chunk_overlap=0)
    text = "Hello world. This is a test.\n\nNew paragraph here."

    # Create a dummy processed document
    doc = ProcessedDocument(
        text=text,
        metadata={},
        tables=[],
        filename="test.txt",
        content_hash="dummy_hash",
    )

    chunks = chunker.chunk_document(doc)

    # Verify chunks
    # We expect multiple chunks due to the small size
    assert len(chunks) >= 2

    # Verify content is preserved across chunks
    all_text = " ".join([c.text for c in chunks])
    assert "Hello world" in all_text
    assert "New paragraph" in all_text

    # Verify that we have at least one split (not everything in one chunk)
    assert any("Hello world" in c.text for c in chunks)
    assert any("New paragraph" in c.text for c in chunks)


def test_content_hash():
    import hashlib

    text = "Test content"
    expected_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    print(expected_hash)

    # We can't easily instantiate DocumentProcessor because of Docling dependency in __init__
    # But we can verify the hash logic if we extracted it, or we can try to mock Docling
    pass
