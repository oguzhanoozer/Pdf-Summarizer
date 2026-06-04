from fastapi import APIRouter
from models import HealthResponse
from services.vector_store import vector_store
from config import get_settings

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check the health status of the application."""
    settings = get_settings()
    chroma_healthy = vector_store.is_healthy()
    doc_count = vector_store.get_document_count()

    return HealthResponse(
        status="healthy" if chroma_healthy else "degraded",
        version="2.0.0",
        chroma_status="connected" if chroma_healthy else "disconnected",
        document_count=doc_count,
        embedding_model=settings.embedding_model,
    )
