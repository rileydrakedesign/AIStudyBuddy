# docx_processor.py - DOCX text extraction and conversion for document ingestion
from io import BytesIO
from typing import List, Tuple, Dict, Optional
from docx import Document
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors

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


def convert_docx_to_pdf(docx_stream: BytesIO) -> BytesIO:
    """
    Convert a DOCX file to PDF format using reportlab.

    Args:
        docx_stream: BytesIO stream containing DOCX file data

    Returns:
        BytesIO stream containing the generated PDF

    Raises:
        Exception: If conversion fails
    """
    try:
        # Read DOCX
        doc = Document(docx_stream)

        # Create PDF buffer
        pdf_buffer = BytesIO()
        pdf_doc = SimpleDocTemplate(
            pdf_buffer,
            pagesize=letter,
            rightMargin=inch,
            leftMargin=inch,
            topMargin=inch,
            bottomMargin=inch
        )

        # Build PDF content
        story = []
        styles = getSampleStyleSheet()
        normal_style = styles['Normal']
        heading_style = styles['Heading1']

        # Process paragraphs
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                story.append(Spacer(1, 0.2 * inch))
                continue

            # Detect headings (basic heuristic: short, bold, or all caps)
            is_heading = (len(text) < 60 and text.isupper()) or len(text) < 40

            try:
                if is_heading:
                    p = Paragraph(text, heading_style)
                else:
                    p = Paragraph(text, normal_style)
                story.append(p)
                story.append(Spacer(1, 0.1 * inch))
            except Exception as e:
                log.warning(f"Could not add paragraph to PDF: {e}")
                continue

        # Process tables
        for table in doc.tables:
            table_data = []
            for row in table.rows:
                row_data = [cell.text.strip() for cell in row.cells]
                table_data.append(row_data)

            if table_data:
                try:
                    pdf_table = Table(table_data)
                    pdf_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, 0), 10),
                        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                        ('GRID', (0, 0), (-1, -1), 1, colors.black)
                    ]))
                    story.append(pdf_table)
                    story.append(Spacer(1, 0.2 * inch))
                except Exception as e:
                    log.warning(f"Could not add table to PDF: {e}")
                    continue

        # Build PDF
        pdf_doc.build(story)
        pdf_buffer.seek(0)

        log.info("Successfully converted DOCX to PDF")
        return pdf_buffer

    except Exception as e:
        log.error(f"Failed to convert DOCX to PDF: {e}")
        raise
