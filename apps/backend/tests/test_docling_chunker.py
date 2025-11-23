from docling.chunking import HybridChunker


def test_docling_chunking():
    # Create a dummy document or load one
    # Since we can't easily create a DoclingDocument from scratch without a file,
    # we will check if we can instantiate the chunker and what it expects.

    chunker = HybridChunker()
    print("HybridChunker instantiated successfully", chunker)

    # We can try to process a simple file if one exists, or just exit
    # The goal is to confirm import and basic usage API


if __name__ == "__main__":
    test_docling_chunking()
