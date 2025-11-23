"""Test script for document listing endpoint."""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

from app.db.models import Client, Conversation, Document
from app.db.session import async_session

# Add backend to path
BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))


async def test_list_documents():
    """Test that we can query documents for a conversation."""
    async with async_session() as session:
        # Get first client
        result = await session.execute(select(Client).limit(1))
        client = result.scalar_one_or_none()

        if not client:
            print("❌ No clients found in database")
            return

        print(f"✅ Found client: {client.fingerprint}")

        # Get first conversation for this client
        result = await session.execute(
            select(Conversation).where(Conversation.client_id == client.id).limit(1)
        )
        conversation = result.scalar_one_or_none()

        if not conversation:
            print("❌ No conversations found for client")
            return

        print(f"✅ Found conversation: {conversation.id}")

        # Query documents for this conversation
        result = await session.execute(
            select(Document)
            .where(Document.conversation_id == conversation.id)
            .order_by(Document.upload_timestamp.desc())
        )
        documents = result.scalars().all()

        print(f"\n📄 Found {len(documents)} document(s):")
        for doc in documents:
            print(f"  - {doc.filename}")
            print(f"    ID: {doc.id}")
            print(f"    Status: {doc.status}")
            print(f"    Chunks: {doc.chunk_count}")
            print(f"    Uploaded: {doc.upload_timestamp}")
            if doc.error_message:
                print(f"    Error: {doc.error_message}")

        if len(documents) == 0:
            print("  (No documents uploaded yet)")

        print("\n✅ Document listing query works correctly!")


if __name__ == "__main__":
    asyncio.run(test_list_documents())
