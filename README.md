# Pleias Chat Interface

An open-source chat interface for Pleias' new language models: **Monad** and **Baguettotron**.

Features a custom thinking trace parser that extracts and visualizes the model's internal reasoning process in beautiful, collapsible UI sections—making it easy to understand how these models arrive at their answers.

## What's Special

- **Custom Thinking Trace Parser**: Parses the model's reasoning into structured, readable sections that reveal its thought process
- **Real-time Streaming**: WebSocket-based streaming for instant token-by-token responses
- **Multi-Model Support**: Switch between Monad, Baguettotron, Llama 2, and Mistral
- **Conversation Management**: Persistent conversations with full history

## Tech Stack

**Backend**: FastAPI (Python) + WebSockets + Hugging Face Transformers + SQLite
**Frontend**: Next.js 16 + React 19 + Tailwind CSS + React Query + Zustand
**Build**: Turborepo monorepo with npm workspaces

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)

### Installation

```bash
# Clone the repo
git clone <repository-url>
cd pleais-demo

# Install dependencies
npm install

# Set up Python environment
cd apps/backend
uv sync

# Initialize database
uv run alembic upgrade head
cd ../..
```

### Run Locally

```bash
npm run dev
```

This starts:
- **Backend** at http://localhost:8000
- **Frontend** at http://localhost:3000

Open http://localhost:3000 and start chatting!

## Project Structure

```
pleais-demo/
├── apps/
│   ├── backend/          # FastAPI + WebSocket + ML models
│   │   ├── app/
│   │   │   ├── main.py   # Server & WebSocket endpoint
│   │   │   └── db/       # SQLAlchemy models & migrations
│   │   └── pyproject.toml
│   └── frontend/         # Next.js React app
│       ├── src/
│       │   ├── app/      # Pages
│       │   ├── components/
│       │   ├── hooks/    # React Query hooks
│       │   └── store/    # Zustand state
│       └── package.json
└── turbo.json
```

## How It Works

### Thinking Trace Visualization

The custom parser extracts structured thinking traces from model outputs and renders them as collapsible sections in the UI. This lets you:
- See how the model breaks down complex problems
- Understand its reasoning steps
- Debug unexpected responses
- Learn from the model's approach

### Real-time Streaming

Uses WebSockets to stream tokens as they're generated, with:
- Token-by-token rendering
- Incomplete markdown completion for smooth display
- Line-by-line animation with smart buffering
- Auto-scrolling with manual override detection

## Development

### Key Technologies

**Backend**:
- FastAPI with WebSocket support
- Transformers (Hugging Face) + PyTorch
- SQLAlchemy (async) + SQLite
- Custom `AsyncQueueTextStreamer` for token streaming

**Frontend**:
- Next.js 16 with App Router
- React Query for server state
- Zustand for client state & WebSocket streaming
- Tailwind CSS 4
- react-markdown with remark plugins

### Common Tasks

**Create database migration**:
```bash
cd apps/backend
uv run alembic revision --autogenerate -m "description"
```

**Run tests**:
```bash
cd apps/frontend
npm test
```

**Build for production**:
```bash
npm run build
```

## Troubleshooting

**Models downloading slowly?**
Models are downloaded from Hugging Face on first use and can be 5-15 GB. Ensure good internet connection and sufficient disk space.

**WebSocket won't connect?**
Make sure the backend is running on port 8000. Check browser console (F12) for errors.

**Out of memory?**
Try using a smaller model or switching from GPU to CPU inference.

**Port already in use?**
```bash
lsof -ti:3000 | xargs kill -9  # Frontend
lsof -ti:8000 | xargs kill -9  # Backend
```

## License

ISC

## Acknowledgments

Built with [FastAPI](https://fastapi.tiangolo.com/), [Hugging Face Transformers](https://huggingface.co/docs/transformers/), [Next.js](https://nextjs.org/), and [Tailwind CSS](https://tailwindcss.com/).
