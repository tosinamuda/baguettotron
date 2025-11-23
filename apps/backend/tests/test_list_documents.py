"""Test script for document listing endpoint."""

import asyncio

import httpx
from sqlalchemy import select

from app.db.models import Client, Conversation, Document
from app.db.session import async_session


async def test_list_documents():
    """Test the document listing endpoint."""
    base_url = "http://localhost:8000"

    # First, get a real conversation with documents from the database
    async with async_session() as session:
        # Find a document and its conversation
        doc_result = await session.execute(select(Document).limit(1))
        document = doc_result.scalar_one_or_none()

        if not document:
            print("❌ No documents found in database")
            return

        conversation_id = document.conversation_id
        print(f"Testing with conversation: {conversation_id}")

        # Get the conversation to find the client
        conv_result = await session.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = conv_result.scalar_one_or_none()

        if not conversation:
            print("❌ Conversation not found")
            return

        # Get the client
        client_result = await session.execute(
            select(Client).where(Client.id == conversation.client_id)
        )
        client = client_result.scalar_one_or_none()

        if not client:
            print("❌ Client not found")
            return

        client_id = client.fingerprint
        print(f"Using client: {client_id}")

    # Now test the endpoint
    async with httpx.AsyncClient() as http_client:
        # Test listing documents
        response = await http_client.get(
            f"{base_url}/api/conversations/{conversation_id}/documents",
            params={"client_id": client_id},
        )

        print(f"\nStatus: {response.status_code}")

        if response.status_code == 200:
            documents = response.json()
            print(f"✅ Successfully retrieved {len(documents)} document(s)")
            for doc in documents:
                print(f"  - {doc['filename']}")
                print(f"    ID: {doc['id']}")
                print(f"    Status: {doc['status']}")
                print(f"    Chunks: {doc['chunk_count']}")
                print(f"    Uploaded: {doc['upload_timestamp']}")
                if doc.get("error_message"):
                    print(f"    Error: {doc['error_message']}")
        else:
            print(f"❌ Failed with status {response.status_code}")
            print(f"Response: {response.json()}")


if __name__ == "__main__":
    asyncio.run(test_list_documents())
