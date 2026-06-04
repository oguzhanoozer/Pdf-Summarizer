from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
class DocumentUploadRequest(BaseModel):
    title: Optional[str] = None


class CreateKnowledgeBaseRequest(BaseModel):
    """POST /create-knowledge-base — accepts a PDF URL."""
    url: str = Field(..., min_length=5, description="URL of the PDF document")
    title: Optional[str] = Field(None, description="Optional document title")


class DocumentResponse(BaseModel):
    id: str
    title: str
    filename: str
    page_count: int
    chunk_count: int
    created_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int


# ---------------------------------------------------------------------------
# Query & Search
# ---------------------------------------------------------------------------
class QueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=2000)
    document_ids: Optional[list[str]] = None
    top_k: int = Field(default=5, ge=1, le=20)


class RunAgentRequest(BaseModel):
    """POST /run-agent — streaming legal analysis."""
    query: str = Field(..., min_length=2, max_length=2000)
    document_ids: Optional[list[str]] = None
    top_k: int = Field(default=5, ge=1, le=20)


class Citation(BaseModel):
    text: str
    page: int
    document_title: str
    document_id: str
    relevance_score: float


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    query: str
    documents_searched: int


class SearchResult(BaseModel):
    text: str
    page: int
    document_title: str
    document_id: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    version: str
    chroma_status: str
    document_count: int
    embedding_model: str = ""
