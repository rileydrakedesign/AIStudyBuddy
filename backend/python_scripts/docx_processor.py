# docx_processor.py - DOCX text extraction for document ingestion
from io import BytesIO
from typing import List, Tuple, Dict, Optional
from docx import Document

from logger_setup import log


def extract_text_from_docx(file_stream: BytesIO) -> str:
    """
    Extract all text content from a DOCX file.

    Args:
        file_stream: BytesIO stream containing DOCX file data

    Returns:
        Concatenated text from all paragraphs in the document

    Raises:
        Exception: If document cannot be parsed or is corrupted
    """
    try:
        doc = Document(file_stream)
        paragraphs = []

        for para in doc.paragraphs:
            text = para.text.strip()
            if text:
                paragraphs.append(text)

        # Extract text from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text = cell.text.strip()
                    if text:
                        paragraphs.append(text)

        full_text = "\n\n".join(paragraphs)
        log.info(f"Extracted {len(paragraphs)} paragraphs/cells from DOCX")
        return full_text

    except Exception as e:
        log.error(f"Failed to extract text from DOCX: {e}")
        raise


def extract_docx_metadata(file_stream: BytesIO) -> Dict[str, str]:
    """
    Extract document properties (title, author) from DOCX file.

    Args:
        file_stream: BytesIO stream containing DOCX file data

    Returns:
        Dictionary with 'title' and 'author' keys

    Raises:
        Exception: If metadata cannot be extracted
    """
    try:
        doc = Document(file_stream)
        core_properties = doc.core_properties

        metadata = {
            "title": core_properties.title or "Unknown",
            "author": core_properties.author or "Unknown"
        }

        log.info(f"Extracted DOCX metadata: title='{metadata['title']}', author='{metadata['author']}'")
        return metadata

    except Exception as e:
        log.error(f"Failed to extract DOCX metadata: {e}")
        # Return defaults if metadata extraction fails
        return {"title": "Unknown", "author": "Unknown"}


def extract_docx_paragraphs(file_stream: BytesIO) -> List[Tuple[str, int]]:
    """
    Extract paragraphs with sequential numbering for page_number field compatibility.

    This function numbers paragraphs sequentially (1, 2, 3...) so they can be stored
    in the existing `page_number` field and work identically to PDF page numbers
    for citations.

    Args:
        file_stream: BytesIO stream containing DOCX file data

    Returns:
        List of tuples: (paragraph_text, paragraph_number)
        Paragraph numbers start at 1 and increment sequentially

    Raises:
        Exception: If document cannot be parsed
    """
    try:
        doc = Document(file_stream)
        paragraphs_with_numbers = []
        paragraph_num = 1

        # Extract regular paragraphs
        for para in doc.paragraphs:
            text = para.text.strip()
            if text:
                paragraphs_with_numbers.append((text, paragraph_num))
                paragraph_num += 1

        # Extract text from tables (each cell as a separate "paragraph")
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text = cell.text.strip()
                    if text:
                        paragraphs_with_numbers.append((text, paragraph_num))
                        paragraph_num += 1

        log.info(f"Extracted {len(paragraphs_with_numbers)} numbered paragraphs from DOCX")
        return paragraphs_with_numbers

    except Exception as e:
        log.error(f"Failed to extract paragraphs from DOCX: {e}")
        raise


def get_docx_stats(file_stream: BytesIO) -> Dict[str, int]:
    """
    Get document statistics for logging and monitoring.

    Args:
        file_stream: BytesIO stream containing DOCX file data

    Returns:
        Dictionary with paragraph_count, table_count, and character_count
    """
    try:
        doc = Document(file_stream)

        paragraph_count = len([p for p in doc.paragraphs if p.text.strip()])
        table_count = len(doc.tables)

        # Count total characters
        char_count = sum(len(p.text) for p in doc.paragraphs)
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    char_count += len(cell.text)

        stats = {
            "paragraph_count": paragraph_count,
            "table_count": table_count,
            "character_count": char_count
        }

        return stats

    except Exception as e:
        log.error(f"Failed to get DOCX stats: {e}")
        return {
            "paragraph_count": 0,
            "table_count": 0,
            "character_count": 0
        }
