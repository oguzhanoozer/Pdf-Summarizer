import uuid
import logging
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional
from models import (
    DocumentResponse,
    DocumentListResponse,
    CreateKnowledgeBaseRequest,
)
from services.pdf_service import pdf_service
from services.vector_store import vector_store
from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["documents"])


@router.post("/create-knowledge-base", response_model=DocumentResponse)
async def create_knowledge_base(request: CreateKnowledgeBaseRequest):
    """Download a PDF from a URL and create a knowledge base from it."""
    try:
        # Download PDF from URL
        logger.info(f"Downloading PDF from: {request.url}")
        pdf_bytes = await pdf_service.download_pdf_from_url(request.url)

        # Process the PDF
        result = pdf_service.process_pdf(pdf_bytes)

        # Generate document ID
        document_id = str(uuid.uuid4())[:12]

        # Generate title from URL if not provided
        if request.title:
            doc_title = request.title
        else:
            parsed = urlparse(request.url)
            filename = parsed.path.split("/")[-1] or "document.pdf"
            doc_title = (
                filename.replace(".pdf", "")
                .replace("-", " ")
                .replace("_", " ")
                .title()
            )

        # Store in vector database
        doc_info = vector_store.store_document(
            document_id=document_id,
            title=doc_title,
            url=request.url,
            chunks=result["chunks"],
            page_count=result["page_count"],
        )

        # Map url -> filename in response
        parsed = urlparse(request.url)
        filename = parsed.path.split("/")[-1] or "document.pdf"
        doc_info["filename"] = filename

        logger.info(
            f"Knowledge base created: {doc_title} – "
            f"{result['page_count']} pages, {len(result['chunks'])} chunks"
        )

        return DocumentResponse(**doc_info)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Create knowledge base error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create knowledge base: {str(e)}",
        )


@router.post("/documents/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None)
):
    """Upload a legal PDF document from file for analysis."""
    settings = get_settings()
    try:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="Only PDF files are allowed"
            )

        # Read file bytes
        pdf_bytes = await file.read()

        if len(pdf_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty"
            )

        # Validate file size
        max_size = settings.max_upload_size_mb * 1024 * 1024
        if len(pdf_bytes) > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {settings.max_upload_size_mb} MB."
            )

        # Validate PDF header (magic bytes)
        if not pdf_bytes[:5] == b"%PDF-":
            raise HTTPException(
                status_code=400,
                detail="Invalid PDF file. The file does not appear to be a valid PDF."
            )

        # Process the PDF
        result = pdf_service.process_pdf(pdf_bytes)

        # Generate document ID
        document_id = str(uuid.uuid4())[:12]

        # Use provided title or generate from filename
        doc_title = title or file.filename.replace(
            ".pdf", ""
        ).replace("-", " ").replace("_", " ").title()

        filename = file.filename or "document.pdf"

        # Store in vector database
        doc_info = vector_store.store_document(
            document_id=document_id,
            title=doc_title,
            url=filename,
            chunks=result["chunks"],
            page_count=result["page_count"]
        )

        # Map url -> filename in response
        doc_info["filename"] = doc_info.pop("url", filename)

        logger.info(
            f"Document uploaded: {doc_title} – "
            f"{result['page_count']} pages, {len(result['chunks'])} chunks"
        )

        return DocumentResponse(**doc_info)

    except HTTPException:
        raise  # re-raise HTTP exceptions as-is
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {str(e)}"
        )


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents():
    """List all uploaded documents."""
    documents = vector_store.get_all_documents()
    # Map url -> filename for all docs
    for doc in documents:
        doc["filename"] = doc.pop("url", "")
    return DocumentListResponse(
        documents=[DocumentResponse(**doc) for doc in documents],
        total=len(documents)
    )


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str):
    """Get details of a specific document."""
    doc = vector_store.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc["filename"] = doc.pop("url", "")
    return DocumentResponse(**doc)


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document and its embeddings."""
    doc = vector_store.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    success = vector_store.delete_document(document_id)
    if not success:
        raise HTTPException(
            status_code=500, detail="Failed to delete document"
        )

    return {"message": "Document deleted successfully", "id": document_id}
