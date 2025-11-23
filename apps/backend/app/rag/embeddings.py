"""Embedding generation module using sentence-transformers."""

import logging
from typing import List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from ..services.model_utils import get_preferred_device
from .config import RAGConfig

logger = logging.getLogger(__name__)


class EmbeddingGenerator:
    """Generates embeddings using sentence-transformers.

    This class handles loading and caching of the embedding model,
    and provides methods for generating embeddings for single texts
    or batches of texts.

    Attributes:
        model: The loaded SentenceTransformer model
        model_name: Name of the embedding model
        dimension: Dimensionality of the embedding vectors
    """

    _instance: Optional["EmbeddingGenerator"] = None
    _model: Optional[SentenceTransformer] = None

    def __init__(self, config: Optional[RAGConfig] = None):
        """Initialize the embedding generator.

        Args:
            config: RAG configuration. If None, loads from environment.
        """
        if config is None:
            config = RAGConfig.from_env()

        self.model_name = config.embedding_model
        self._load_model()

    def _load_model(self) -> None:
        """Load the sentence-transformers model.

        The model is loaded once and cached for reuse across all
        embedding generation operations.
        """
        if EmbeddingGenerator._model is None:
            device = get_preferred_device()
            logger.info("Loading embedding model: %s on %s", self.model_name, device)
            if device.type == "mps":
                logger.info("Detected Apple Silicon (MPS backend) for embeddings")
            EmbeddingGenerator._model = SentenceTransformer(
                self.model_name,
                device=device,
            )
            logger.info(f"Model loaded successfully: {self.model_name}")

        self.model = EmbeddingGenerator._model

        # Determine embedding dimension based on model
        if "all-MiniLM-L6-v2" in self.model_name:
            self.dimension = 384
        elif "all-mpnet-base-v2" in self.model_name:
            self.dimension = 768
        else:
            # Get dimension from model
            self.dimension = self.model.get_sentence_embedding_dimension()

    @classmethod
    def get_instance(cls, config: Optional[RAGConfig] = None) -> "EmbeddingGenerator":
        """Get singleton instance of EmbeddingGenerator.

        Args:
            config: RAG configuration. If None, loads from environment.

        Returns:
            Singleton EmbeddingGenerator instance
        """
        if cls._instance is None:
            cls._instance = cls(config)
        return cls._instance

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generate embedding vector for a single text.

        Args:
            text: Input text to embed

        Returns:
            Numpy array of shape (dimension,) containing the embedding
        """
        embedding = self.model.encode(
            text, convert_to_numpy=True, show_progress_bar=False
        )
        return embedding

    def generate_batch_embeddings(
        self, texts: List[str], batch_size: int = 32
    ) -> np.ndarray:
        """Generate embeddings for multiple texts efficiently.

        Args:
            texts: List of input texts to embed
            batch_size: Batch size for processing (default: 32)

        Returns:
            Numpy array of shape (len(texts), dimension)
        """
        embeddings = self.model.encode(
            texts, convert_to_numpy=True, batch_size=batch_size, show_progress_bar=False
        )
        return embeddings
