import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models import (
    QueryRequest,
    QueryResponse,
    RunAgentRequest,
    SearchResponse,
    SearchResult,
    Citation
)
from services.vector_store import vector_store
from services.llm_service import llm_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["query"])


# ------------------------------------------------------------------
# Streaming Agent Endpoint (new — architecture diagram)
# ------------------------------------------------------------------
@router.post("/run-agent")
async def run_agent(request: RunAgentRequest):
    """
    Streaming legal analysis agent.

    1. Searches ChromaDB for relevant chunks
    2. Sends chunks + query to GPT
    3. Streams the response back as Server-Sent Events (SSE)

    Each SSE line is a JSON object:
      {"type": "chunk",     "content": "..."}
      {"type": "citations", "citations": [...]}
      {"type": "done"}
      {"type": "error",     "message": "..."}
    """
    try:
        # Perform hybrid search in ChromaDB
        search_results = vector_store.search(
            query=request.query,
            document_ids=request.document_ids,
            top_k=request.top_k,
        )

        # Count unique documents searched
        searched_doc_ids = set()
        if request.document_ids:
            searched_doc_ids = set(request.document_ids)
        else:
            searched_doc_ids = {r["document_id"] for r in search_results}

        async def event_stream():
            """Yield SSE lines from the LLM streaming generator."""
            import json

            # First send metadata about the search
            yield f"data: {json.dumps({'type': 'meta', 'documents_searched': len(searched_doc_ids), 'chunks_found': len(search_results)})}\n\n"

            # Stream analysis from LLM
            async for line in llm_service.analyze_stream(
                query=request.query,
                search_results=search_results,
            ):
                yield f"data: {line}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as e:
        logger.error(f"Run agent error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Agent failed: {str(e)}",
        )


# ------------------------------------------------------------------
# Legacy Endpoints (kept for backward compatibility)
# ------------------------------------------------------------------
@router.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Query documents using semantic search + GPT analysis.
    Retrieves relevant chunks and generates legal analysis with citations.
    """
    try:
        # Perform semantic search
        search_results = vector_store.search(
            query=request.query,
            document_ids=request.document_ids,
            top_k=request.top_k
        )

        # Count unique documents searched
        searched_doc_ids = set()
        if request.document_ids:
            searched_doc_ids = set(request.document_ids)
        else:
            searched_doc_ids = {r["document_id"] for r in search_results}

        # Generate analysis with GPT
        analysis = await llm_service.analyze(
            query=request.query,
            search_results=search_results
        )

        return QueryResponse(
            answer=analysis["answer"],
            citations=[
                Citation(**citation) for citation in analysis["citations"]
            ],
            query=request.query,
            documents_searched=len(searched_doc_ids)
        )

    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Query failed: {str(e)}"
        )


@router.post("/query/search", response_model=SearchResponse)
async def search_documents(request: QueryRequest):
    """
    Raw semantic search without GPT analysis.
    Returns matching document chunks ranked by relevance.
    """
    try:
        search_results = vector_store.search(
            query=request.query,
            document_ids=request.document_ids,
            top_k=request.top_k
        )

        return SearchResponse(
            results=[SearchResult(**r) for r in search_results],
            query=request.query
        )

    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )
