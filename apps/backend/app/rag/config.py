"""RAG configuration module with environment variable support."""

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class RAGConfig:
    """Configuration for RAG system."""

    enabled: bool = True
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chunk_size: int = 512
    chunk_overlap: int = 50
    top_k: int = 3
    min_similarity: float = 0.3
    max_file_size_mb: int = 50
    upload_dir: Path = Path("app/data/uploads")

    @classmethod
    def from_env(cls) -> "RAGConfig":
        """Create RAGConfig from environment variables.

        Environment variables:
            RAG_ENABLED: Enable/disable RAG (default: true)
            RAG_EMBEDDING_MODEL: Embedding model name (default: sentence-transformers/all-MiniLM-L6-v2)
            RAG_CHUNK_SIZE: Chunk size in tokens (default: 512)
            RAG_CHUNK_OVERLAP: Chunk overlap in tokens (default: 50)
            RAG_TOP_K: Number of chunks to retrieve (default: 5)
            RAG_MIN_SIMILARITY: Minimum similarity threshold (default: 0.7)
            RAG_MAX_FILE_SIZE_MB: Maximum file size in MB (default: 50)
            DOCUMENT_UPLOAD_DIR: Directory for uploaded documents (default: /app/data/uploads)

        Returns:
            RAGConfig instance with values from environment or defaults
        """
        return cls(
            enabled=os.getenv("RAG_ENABLED", "true").lower() == "true",
            embedding_model=os.getenv(
                "RAG_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
            ),
            chunk_size=int(os.getenv("RAG_CHUNK_SIZE", "512")),
            chunk_overlap=int(os.getenv("RAG_CHUNK_OVERLAP", "50")),
            top_k=int(os.getenv("RAG_TOP_K", "3")),
            min_similarity=float(os.getenv("RAG_MIN_SIMILARITY", "0.3")),
            max_file_size_mb=int(os.getenv("RAG_MAX_FILE_SIZE_MB", "50")),
            upload_dir=Path(os.getenv("DOCUMENT_UPLOAD_DIR", "app/data/uploads")),
        )
