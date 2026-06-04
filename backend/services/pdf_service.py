from __future__ import annotations

import io
import re
import logging
from typing import Optional
from pypdf import PdfReader
import httpx

logger = logging.getLogger(__name__)

# Lazy import — pdfplumber is heavy; fall back to pypdf if absent
try:
    import pdfplumber  # type: ignore
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    logger.warning("pdfplumber not installed – falling back to pypdf for extraction")

from config import get_settings

# ---------------------------------------------------------------------------
# Patterns for cleaning extracted text
# ---------------------------------------------------------------------------
_HEADER_FOOTER_RE = re.compile(
    r"(?m)^(?:page\s*\d+.*|^\d+\s*$|^(?:confidential|draft|privileged).*$)",
    re.IGNORECASE,
)
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_HYPHEN_BREAK_RE = re.compile(r"(\w)-\n(\w)")

# Legal section heading pattern (e.g.  "ARTICLE 5", "Section 3.2", "MADDE 12")
_SECTION_HEADING_RE = re.compile(
    r"(?m)^[ \t]*"
    r"(?:"
    r"(?:ARTICLE|Article|SECTION|Section|MADDE|Madde|BÖLÜM|Bölüm|KISIM|Kısım)"
    r"[ \t]*[\d]+(?:\.[\d]+)*"
    r"|"
    r"\d{1,3}(?:\.\d{1,3})+\.?\s"  # numeric like 3.2.1
    r"|"
    r"[A-Z][A-Z ]{4,}$"  # ALL-CAPS line (likely heading)
    r")"
)


class PDFService:
    def __init__(self):
        self.settings = get_settings()

    # ------------------------------------------------------------------
    # Extraction
    # ------------------------------------------------------------------
    def extract_text(self, pdf_bytes: bytes) -> list[dict]:
        """Extract text from PDF bytes, page-by-page.

        Uses *pdfplumber* when available (better layout preservation,
        table handling) and falls back to *pypdf*.
        """
        if HAS_PDFPLUMBER:
            return self._extract_with_pdfplumber(pdf_bytes)
        return self._extract_with_pypdf(pdf_bytes)

    def _extract_with_pdfplumber(self, pdf_bytes: bytes) -> list[dict]:
        pages: list[dict] = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                # Extract tables first for structured data
                tables = page.extract_tables()
                table_text = self._format_tables(tables)

                # Extract raw text (layout-aware)
                raw_text = page.extract_text(
                    layout=True,
                    x_density=7.25,
                    y_density=13,
                ) or ""

                # Combine text + tables
                combined = raw_text.strip()
                if table_text:
                    combined += "\n\n[TABLE]\n" + table_text + "\n[/TABLE]"

                if combined.strip():
                    pages.append({
                        "page_number": i + 1,
                        "text": combined.strip(),
                    })
        return pages

    def _extract_with_pypdf(self, pdf_bytes: bytes) -> list[dict]:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages: list[dict] = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                pages.append({
                    "page_number": i + 1,
                    "text": text.strip(),
                })
        return pages

    @staticmethod
    def _format_tables(tables: list) -> str:
        """Convert extracted tables to readable Markdown-style text."""
        if not tables:
            return ""
        parts: list[str] = []
        for table in tables:
            rows: list[str] = []
            for row in table:
                cells = [str(c).strip() if c else "" for c in row]
                rows.append(" | ".join(cells))
            if rows:
                parts.append("\n".join(rows))
        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Text Cleaning / Preprocessing
    # ------------------------------------------------------------------
    def clean_text(self, text: str) -> str:
        """Normalise and clean extracted PDF text."""
        # Fix hyphen line-breaks (e.g. "indem-\nnity" -> "indemnity")
        text = _HYPHEN_BREAK_RE.sub(r"\1\2", text)

        # Remove likely headers / footers
        text = _HEADER_FOOTER_RE.sub("", text)

        # Collapse multiple spaces / newlines
        text = _MULTI_SPACE_RE.sub(" ", text)
        text = _MULTI_NEWLINE_RE.sub("\n\n", text)

        # Normalise common unicode oddities from PDFs
        replacements = {
            "\u2018": "'", "\u2019": "'",
            "\u201c": '"', "\u201d": '"',
            "\u2013": "-", "\u2014": "-",
            "\u2026": "...",
            "\xa0": " ",   # non-breaking space
            "\xad": "",    # soft-hyphen
        }
        for old, new in replacements.items():
            text = text.replace(old, new)

        return text.strip()

    # ------------------------------------------------------------------
    # Smart Chunking
    # ------------------------------------------------------------------
    def chunk_text(
        self,
        pages: list[dict],
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> list[dict]:
        """Split pages into overlapping chunks with smart boundary detection.

        Strategy:
        1. Try to split on *section/article headings* first.
        2. Fall back to *paragraph boundaries* (\n\n).
        3. Fall back to *sentence boundaries* (. ? !).
        4. Hard cut as last resort.
        """
        if chunk_size is None:
            chunk_size = self.settings.chunk_size
        if chunk_overlap is None:
            chunk_overlap = self.settings.chunk_overlap

        chunks: list[dict] = []
        chunk_id = 0

        for page_data in pages:
            raw_text = page_data["text"]
            page_num = page_data["page_number"]

            # Clean the text for this page
            text = self.clean_text(raw_text)
            if not text:
                continue

            start = 0
            while start < len(text):
                end = min(start + chunk_size, len(text))

                # If we're not at the very end, find best split point
                if end < len(text):
                    end = self._find_best_split(text, start, end, chunk_size)

                chunk_text_str = text[start:end].strip()
                if chunk_text_str and len(chunk_text_str) >= 50:
                    chunks.append({
                        "id": f"chunk_{chunk_id}",
                        "text": chunk_text_str,
                        "page_number": page_num,
                        "start_char": start,
                        "end_char": end,
                    })
                    chunk_id += 1

                # Advance with overlap
                next_start = end - chunk_overlap
                if next_start <= start:
                    next_start = end  # prevent infinite loop
                start = next_start
                if end >= len(text):
                    break

        return chunks

    def _find_best_split(
        self, text: str, start: int, end: int, chunk_size: int
    ) -> int:
        """Find the best position to split text within [start, end].

        Priority: section heading > paragraph > sentence > word > hard cut.
        """
        window = text[start:end]
        min_pos = int(chunk_size * 0.4)  # don't split too early

        # 1. Section heading boundary
        for m in _SECTION_HEADING_RE.finditer(window):
            if m.start() >= min_pos:
                return start + m.start()

        # 2. Paragraph boundary
        last_para = window.rfind("\n\n")
        if last_para != -1 and last_para >= min_pos:
            return start + last_para

        # 3. Sentence boundary  (. / ? / ! followed by space or newline)
        sentence_ends = [
            m.end()
            for m in re.finditer(r'[.!?][\s\n]', window)
            if m.end() >= min_pos
        ]
        if sentence_ends:
            return start + sentence_ends[-1]

        # 4. Word boundary
        last_space = window.rfind(" ")
        if last_space != -1 and last_space >= min_pos:
            return start + last_space

        # 5. Hard cut
        return end

    # ------------------------------------------------------------------
    # Download PDF from URL
    # ------------------------------------------------------------------
    async def download_pdf_from_url(self, url: str) -> bytes:
        """Download a PDF file from a given URL and return its bytes."""
        max_size = self.settings.max_upload_size_mb * 1024 * 1024
        try:
            async with httpx.AsyncClient(
                follow_redirects=True, timeout=60.0
            ) as client:
                response = await client.get(url)
                response.raise_for_status()

                pdf_bytes = response.content

                if len(pdf_bytes) == 0:
                    raise ValueError("Downloaded file is empty")

                if len(pdf_bytes) > max_size:
                    raise ValueError(
                        f"File too large. Maximum size is "
                        f"{self.settings.max_upload_size_mb} MB."
                    )

                if not pdf_bytes[:5] == b"%PDF-":
                    raise ValueError(
                        "The URL does not point to a valid PDF file."
                    )

                return pdf_bytes
        except httpx.HTTPStatusError as e:
            raise ValueError(
                f"Failed to download PDF: HTTP {e.response.status_code}"
            )
        except httpx.RequestError as e:
            raise ValueError(f"Failed to download PDF: {str(e)}")

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------
    def process_pdf(self, pdf_bytes: bytes) -> dict:
        """Full pipeline: extract → clean → chunk."""
        logger.info("Extracting text from PDF...")
        pages = self.extract_text(pdf_bytes)

        if not pages:
            raise ValueError(
                "Could not extract any text from the PDF. "
                "It may be scanned/image-based."
            )

        logger.info(
            f"Extracted text from {len(pages)} pages "
            f"(using {'pdfplumber' if HAS_PDFPLUMBER else 'pypdf'})"
        )

        chunks = self.chunk_text(pages)
        logger.info(f"Created {len(chunks)} chunks")

        # Total number of pages in the original PDF
        total_pages = len(PdfReader(io.BytesIO(pdf_bytes)).pages)

        return {
            "page_count": len(pages),
            "chunks": chunks,
            "total_pages_in_pdf": total_pages,
        }


pdf_service = PDFService()

