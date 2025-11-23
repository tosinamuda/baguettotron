import asyncio
import logging
import os
import sys

from ..app.rag.chunker import TextChunker
from ..app.rag.document_processor import ProcessedDocument
from ..app.rag.embeddings import EmbeddingGenerator
from ..app.rag.retriever import RAGRetriever
from ..app.rag.vector_store import RetrievedChunk, VectorStore

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "apps/backend"))

# Mock docling
from unittest.mock import MagicMock

sys.modules["docling"] = MagicMock()
sys.modules["docling.chunking"] = MagicMock()
sys.modules["docling.datamodel"] = MagicMock()
sys.modules["docling.datamodel.document"] = MagicMock()
sys.modules["docling.document_converter"] = MagicMock()


# Configure logging
logging.basicConfig(level=logging.INFO)


async def main():
    print("--- Starting Reproduction Script ---")

    # Mock CV Text
    cv_text = """
AMUDA TAIWO ESTHER
Phone: 08108209174 | Email: amudataiwo90@gmail.com
Address: Beside Seliat Multipurpose Hall, Felele, Ibadan, Oyo State

Reading, Cooking, Playing games

To obtain a Radiography internship position where I can apply my academic knowledge, develop strong clinical competencies, and contribute to quality healthcare delivery through safe, effective, and patient-centered diagnostic imaging practices.

Lead City University, Ibadan
— B.Sc. Radiography (2019–2025)
College of Health Sciences and Technology, Ijero-Ekiti
— Diploma in Radiography (2016–2019)
Covenant Secondary Academy, Ado Ekiti
— (WASSCE, 2016)
Fountain of Knowledge Primary School, Oka Akoko
— (2002–2008)

Epe General Hospital, Lagos State
— May to July 2025
- Supported the imaging team during routine radiographic procedures
- Operated CR/DR imaging systems under supervision
- Participated in image quality assessment and exposure optimization
- Collaborated with healthcare workers to ensure efficient patient workflow

General Hospital Iwaro-Oka, Akoko
— August to October 2024
- Assisted radiographers with routine diagnostic imaging examinations
- Ensured accurate patient identification and proper workflow
- Gained experience in patient communication and image evaluation
- Applied infection control and radiation protection principles

University College Hospital (UCH), Ibadan
— May to July 2023
- Participated in general, chest, and extremity radiographic procedures under supervision
- Assisted with patient positioning and equipment preparation
- Practiced radiation safety measures and observed quality control procedures
- Observed digital image processing workflows

Skills
- Radiographic Positioning
- Radiation Safety & Protection
- Patient Care & Communication
- Digital Imaging (CR/DR Systems)
- Medical Terminology
- Team Collaboration
- Attention to Detail
"""

    # 1. Chunking
    print("\n--- Chunking Document ---")
    chunker = TextChunker(chunk_size=512, chunk_overlap=50)

    # Create a mock ProcessedDocument (simulating plain text for now as we can't easily mock Docling structure without the library/file)
    processed_doc = ProcessedDocument(
        text=cv_text,
        metadata={"filename": "cv.txt"},
        tables=[],
        filename="cv.txt",
        content_hash="hash123",
    )

    chunks = chunker.chunk_document(processed_doc)

    print(f"Created {len(chunks)} chunks:")
    for i, chunk in enumerate(chunks):
        print(
            f"Chunk {i} (len={len(chunk.text)}): {chunk.text[:50]}...{chunk.text[-50:]}"
        )

    # 2. Embedding & Retrieval
    print("\n--- Embedding & Retrieval ---")
    embedding_gen = EmbeddingGenerator.get_instance()

    # Create a mock VectorStore (in-memory)
    class MockVectorStore(VectorStore):
        def __init__(self):
            self.chunks = []
            self.embeddings = []

        async def add_documents(self, documents):
            pass  # Not needed for this test

        async def similarity_search(
            self,
            query_embedding,
            conversation_id,
            top_k,
            min_similarity,
            document_id=None,
        ):
            # Calculate cosine similarity manually
            import numpy as np
            from numpy.linalg import norm

            results = []
            for i, chunk_emb in enumerate(self.embeddings):
                # Cosine similarity
                sim = np.dot(query_embedding, chunk_emb) / (
                    norm(query_embedding) * norm(chunk_emb)
                )

                print(f"Debug: Chunk {i} similarity: {sim:.4f}")

                if sim >= 0.0:  # Return all for debugging
                    results.append((sim, self.chunks[i]))

            # Sort by similarity
            results.sort(key=lambda x: x[0], reverse=True)

            # Filter by top_k
            return [r[1] for r in results[:top_k]]

    vector_store = MockVectorStore()
    vector_store.chunks = [
        RetrievedChunk(
            chunk_id=f"chunk-{i}",
            document_id="doc-1",
            text=c.text,
            metadata=c.metadata,
            similarity_score=0.0,
            chunk_index=i,
        )
        for i, c in enumerate(chunks)
    ]

    # Generate embeddings for chunks
    print("Generating chunk embeddings...")
    chunk_texts = [c.text for c in chunks]
    vector_store.embeddings = embedding_gen.generate_batch_embeddings(chunk_texts)

    retriever = RAGRetriever(
        embedding_generator=embedding_gen, vector_store=vector_store
    )

    query = "what skills are listed in the cv?"
    print(f"\nQuery: '{query}'")

    context = await retriever.retrieve_context(
        query=query,
        conversation_id="test-conv",
        top_k=3,
        min_similarity=0.0,  # Set to 0 to see all results
    )

    if context:
        print("\n--- Top Results ---")
        for i, chunk in enumerate(context.chunks):
            print(f"Rank {i + 1}: {chunk.text[:100]}...")


if __name__ == "__main__":
    asyncio.run(main())
