import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from app.db.models import Document
from app.rag.document_processor import ProcessedDocument
from app.services.document_service import process_document_background


class TestDeduplication(unittest.IsolatedAsyncioTestCase):
    async def test_silent_deduplication(self):
        # Mock dependencies
        mock_processor = MagicMock()
        mock_processed_doc = ProcessedDocument(
            text="Duplicate content",
            metadata={},
            tables=[],
            filename="duplicate.pdf",
            content_hash="existing_hash",
            docling_document=None,
        )
        mock_processor.process_document = AsyncMock(return_value=mock_processed_doc)

        # Mock DB session
        mock_session = AsyncMock()
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__.return_value = mock_session
        mock_session_ctx.__aexit__.return_value = None

        # Mock existing document found in DB
        existing_doc = Document(
            id="existing_id",
            filename="original.pdf",
            content_hash="existing_hash",
            chunk_count=5,
            status="ready",
        )

        # Mock current document (the one being processed)
        current_doc = Document(
            id="new_id",
            filename="duplicate.pdf",
            content_hash=None,
            status="processing",
        )

        # Setup execute results
        # First query checks for duplicates -> returns existing_doc
        # Second query fetches current_doc -> returns current_doc
        mock_result_existing = MagicMock()
        mock_result_existing.scalar_one_or_none.return_value = existing_doc

        mock_result_current = MagicMock()
        mock_result_current.scalar_one_or_none.return_value = current_doc

        mock_session.execute.side_effect = [mock_result_existing, mock_result_current]

        # Mock broadcast
        mock_broadcast = AsyncMock()

        # Patch everything
        with (
            patch(
                "app.services.document_service.DocumentProcessor.get_instance",
                return_value=mock_processor,
            ),
            patch(
                "app.services.document_service.async_session",
                return_value=mock_session_ctx,
            ),
            patch("app.services.document_service.broadcast", mock_broadcast),
        ):
            await process_document_background(
                "new_id", Path("path/to/duplicate.pdf"), "conv_id", "duplicate.pdf"
            )

            # Verification

            # 1. Check that current_doc was updated
            self.assertEqual(current_doc.status, "ready")
            self.assertEqual(current_doc.chunk_count, 5)
            self.assertEqual(current_doc.content_hash, "existing_hash")

            # 2. Check that session was committed
            self.assertTrue(mock_session.commit.called)

            # 3. Check broadcast calls
            # Expect: processing_started, docling_done, then persisted
            self.assertEqual(mock_broadcast.call_count, 3)

            # Check last broadcast was 'persisted' with status 'ready'
            last_call_args = mock_broadcast.call_args_list[-1]
            event_data = last_call_args[0][1]
            self.assertEqual(event_data["type"], "persisted")
            self.assertEqual(event_data["status"], "ready")
            self.assertEqual(event_data["chunk_count"], 5)

            # Ensure chunking_done was NOT broadcasted
            types = [call[0][1]["type"] for call in mock_broadcast.call_args_list]
            self.assertIn("processing_started", types)
            self.assertIn("docling_done", types)
            self.assertNotIn("chunking_done", types)
