"""Document processing using Docling."""

import logging
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Optional

from docling.document_converter import DocumentConverter
from docling.datamodel.document import DoclingDocument

logger = logging.getLogger(__name__)


@dataclass
class ProcessedDocument:
    """Processed document with extracted text and metadata."""

    text: str
    metadata: dict[str, Any]
    tables: list[dict[str, Any]]
    filename: str
    content_hash: str
    docling_document: Optional[DoclingDocument] = None


class DocumentProcessor:
    """Extracts text and structure from documents using Docling."""

    _instance: ClassVar[Optional["DocumentProcessor"]] = None
    _converter: ClassVar[Optional[DocumentConverter]] = None

    def __init__(self):
        """Initialize DocumentProcessor with Docling configuration."""
        # Initialize Docling converter with default configuration
        # Docling automatically handles PDF, DOCX, PPTX, images, etc.
        if DocumentProcessor._converter is None:
            DocumentProcessor._converter = DocumentConverter()
            logger.info("DocumentProcessor initialized with Docling")
        self.converter = DocumentProcessor._converter

    @classmethod
    def get_instance(cls) -> "DocumentProcessor":
        """Get singleton instance to avoid reloading Docling per document."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def process_document(
        self, file_path: Path, filename: str
    ) -> ProcessedDocument:
        """Extract text, tables, and metadata from document.

        Args:
            file_path: Path to the document file
            filename: Original filename

        Returns:
            ProcessedDocument with text, metadata, tables

        Raises:
            ValueError: If file format is not supported
            RuntimeError: If document processing fails
        """
        try:
            logger.info("Processing document: %s", filename)

            # Check if file exists
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")

            # Handle plain text files directly
            if self._is_plain_text(file_path):
                return self._process_plain_text(file_path, filename)

            # Use Docling for other formats (PDF, DOCX, etc.)
            return self._process_with_docling(file_path, filename)

        except Exception as e:
            logger.error("Error processing document %s: %s", filename, e)
            raise RuntimeError(
                "Failed to process document %s: %s" % (filename, str(e))
            ) from e

    def _is_plain_text(self, file_path: Path) -> bool:
        """Check if file is plain text format.

        Args:
            file_path: Path to the file

        Returns:
            True if file is plain text (TXT, MD)
        """
        text_extensions = {".txt", ".md", ".markdown", ".text"}
        return file_path.suffix.lower() in text_extensions

    def _process_plain_text(self, file_path: Path, filename: str) -> ProcessedDocument:
        """Process plain text files directly.

        Args:
            file_path: Path to the text file
            filename: Original filename

        Returns:
            ProcessedDocument with text content
        """
        try:
            # Read text file with UTF-8 encoding
            text = file_path.read_text(encoding="utf-8")

            metadata = {
                "filename": filename,
                "file_type": file_path.suffix.lower(),
                "char_count": len(text),
                "line_count": text.count("\n") + 1,
            }

            logger.info(
                "Processed plain text file: %s (%d chars)",
                filename,
                metadata["char_count"],
            )

            # Calculate hash
            content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

            return ProcessedDocument(
                text=text,
                metadata=metadata,
                tables=[],
                filename=filename,
                content_hash=content_hash,
                docling_document=None,
            )

        except UnicodeDecodeError:
            # Try with different encoding if UTF-8 fails
            text = file_path.read_text(encoding="latin-1")
            metadata = {
                "filename": filename,
                "file_type": file_path.suffix.lower(),
                "char_count": len(text),
                "line_count": text.count("\n") + 1,
                "encoding": "latin-1",
            }
            # Calculate hash
            content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

            return ProcessedDocument(
                text=text,
                metadata=metadata,
                tables=[],
                filename=filename,
                content_hash=content_hash,
                docling_document=None,
            )

    def _process_with_docling(
        self, file_path: Path, filename: str
    ) -> ProcessedDocument:
        """Process document using Docling.

        Args:
            file_path: Path to the document file
            filename: Original filename

        Returns:
            ProcessedDocument with extracted text, metadata, and tables
        """
        # Convert document using Docling
        result = self.converter.convert(str(file_path))

        # Extract text content
        # Docling returns a Document object with markdown export
        text = result.document.export_to_markdown()

        # Extract metadata
        metadata = self._extract_metadata(result, filename, file_path)

        # Extract tables
        tables = self._extract_tables(result)

        logger.info(
            "Processed document with Docling: %s (%d chars, %d tables)",
            filename,
            len(text),
            len(tables),
        )

        # Calculate hash
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

        return ProcessedDocument(
            text=text,
            metadata=metadata,
            tables=tables,
            filename=filename,
            content_hash=content_hash,
            docling_document=result.document,
        )

    def _extract_metadata(
        self, result: Any, filename: str, file_path: Path
    ) -> dict[str, Any]:
        """Extract metadata from Docling result.

        Args:
            result: Docling conversion result
            filename: Original filename
            file_path: Path to the file

        Returns:
            Dictionary with metadata
        """
        metadata: dict[str, Any] = {
            "filename": filename,
            "file_type": file_path.suffix.lower(),
        }

        # Extract document-level metadata if available
        doc = result.document
        if hasattr(doc, "pages") and doc.pages:
            metadata["page_count"] = len(doc.pages)

        # Extract text statistics
        text = doc.export_to_markdown()
        metadata["char_count"] = len(text)

        # Try to extract additional metadata from document properties
        if hasattr(doc, "metadata") and doc.metadata:
            doc_meta = doc.metadata
            if hasattr(doc_meta, "title") and doc_meta.title:
                metadata["title"] = doc_meta.title
            if hasattr(doc_meta, "author") and doc_meta.author:
                metadata["author"] = doc_meta.author
            if hasattr(doc_meta, "creation_date") and doc_meta.creation_date:
                metadata["creation_date"] = str(doc_meta.creation_date)

        return metadata

    def _extract_tables(self, result: Any) -> list[dict[str, Any]]:
        """Extract tables from Docling result.

        Args:
            result: Docling conversion result

        Returns:
            List of table dictionaries
        """
        tables = []

        # Docling extracts tables as part of the document structure
        doc = result.document
        if hasattr(doc, "tables") and doc.tables:
            for idx, table in enumerate(doc.tables):
                table_data = {
                    "index": idx,
                    "content": str(table),
                }
                # Try to extract table metadata if available
                if hasattr(table, "num_rows"):
                    table_data["num_rows"] = table.num_rows
                if hasattr(table, "num_cols"):
                    table_data["num_cols"] = table.num_cols

                tables.append(table_data)

        return tables
