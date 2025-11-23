# Backend

FastAPI backend for Baguettotron Chat with RAG capabilities.

## Setup

Install dependencies:

```bash
uv sync
```

## Database

Run migrations:

```bash
alembic upgrade head
```

Create a new migration:

```bash
alembic revision --autogenerate -m "description"
```

## Development

Run the development server:

```bash
npm run dev
# or
fastapi dev app/main.py
```

The API will be available at http://localhost:8000

## RAG Configuration

The backend supports optional Retrieval-Augmented Generation (RAG) for document-based chat. Configure RAG using environment variables:

### Environment Variables

Copy `.env.example` to `.env` and configure:

- `RAG_ENABLED`: Enable/disable RAG functionality (default: `true`)
- `RAG_EMBEDDING_MODEL`: Embedding model to use (default: `sentence-transformers/all-MiniLM-L6-v2`)
  - Alternative: `sentence-transformers/all-mpnet-base-v2` (768 dimensions, higher quality)
- `RAG_CHUNK_SIZE`: Text chunk size in tokens (default: `512`)
- `RAG_CHUNK_OVERLAP`: Overlap between chunks in tokens (default: `50`)
- `RAG_TOP_K`: Number of chunks to retrieve per query (default: `5`)
- `RAG_MIN_SIMILARITY`: Minimum similarity threshold for retrieval (default: `0.7`)
- `RAG_MAX_FILE_SIZE_MB`: Maximum file size for uploads in MB (default: `50`)
- `DOCUMENT_UPLOAD_DIR`: Directory for uploaded documents (default: `/app/data/uploads`)

### Embedding Models

Two embedding models are supported:

1. **all-MiniLM-L6-v2** (default): 384 dimensions, faster, good quality
2. **all-mpnet-base-v2**: 768 dimensions, slower, higher quality

Choose based on your performance vs. quality requirements.

### Default Configuration

The system uses sensible defaults that work well for most use cases:
- Chunk size: 512 tokens (good balance between context and granularity)
- Chunk overlap: 50 tokens (ensures continuity across chunks)
- Top-K: 5 chunks (provides sufficient context without overwhelming the model)
- Min similarity: 0.7 (filters out irrelevant chunks)
