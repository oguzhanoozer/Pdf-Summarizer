from __future__ import annotations

import chromadb
import logging
import re
from typing import Optional
from datetime import datetime, timezone
from openai import OpenAI
from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple keyword scorer for hybrid search
# ---------------------------------------------------------------------------

def _keyword_score(query: str, text: str) -> float:
    """Compute a basic keyword overlap score between query and text (0-1)."""
    query_lower = query.lower()
    text_lower = text.lower()
    # Tokenise by non-alphanumeric (works for both English and Turkish ASCII)
    query_tokens = set(re.findall(r"\w{2,}", query_lower))
    if not query_tokens:
        return 0.0
    text_tokens = set(re.findall(r"\w{2,}", text_lower))
    overlap = query_tokens & text_tokens
    return len(overlap) / len(query_tokens)


class VectorStoreService:
    def __init__(self):
        self.settings = get_settings()
        self.client = None
        self._meta_collection = None
        self._openai: OpenAI | None = None

    def initialize(self):
        """Initialize ChromaDB client and OpenAI embeddings."""
        logger.info(
            f"Initializing ChromaDB at: {self.settings.chroma_persist_dir}"
        )
        self.client = chromadb.PersistentClient(
            path=self.settings.chroma_persist_dir
        )
        self._meta_collection = self.client.get_or_create_collection(
            name="document_metadata",
            metadata={"description": "Stores document metadata"},
        )
        # OpenAI client for embeddings
        self._openai = OpenAI(api_key=self.settings.openai_api_key)
        logger.info(
            f"ChromaDB initialized – embedding model: "
            f"{self.settings.embedding_model}"
        )

    # ------------------------------------------------------------------
    # Embedding helper
    # ------------------------------------------------------------------
    def _embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings via OpenAI API."""
        response = self._openai.embeddings.create(
            model=self.settings.embedding_model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    # ------------------------------------------------------------------
    # Collection helpers
    # ------------------------------------------------------------------
    def _get_collection_name(self, document_id: str) -> str:
        name = f"doc_{document_id[:50]}"
        return name

    # ------------------------------------------------------------------
    # Store
    # ------------------------------------------------------------------
    def store_document(
        self,
        document_id: str,
        title: str,
        url: str,
        chunks: list[dict],
        page_count: int,
    ) -> dict:
        """Store document chunks with OpenAI embeddings in ChromaDB."""
        collection_name = self._get_collection_name(document_id)

        collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"document_id": document_id, "title": title},
        )

        ids = [f"{document_id}_{chunk['id']}" for chunk in chunks]
        documents = [chunk["text"] for chunk in chunks]
        metadatas = [
            {
                "page_number": chunk["page_number"],
                "start_char": chunk["start_char"],
                "end_char": chunk["end_char"],
                "document_id": document_id,
                "document_title": title,
            }
            for chunk in chunks
        ]

        # Generate embeddings via OpenAI
        logger.info(
            f"Generating embeddings for {len(documents)} chunks "
            f"(model: {self.settings.embedding_model})…"
        )
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            batch_end = min(i + batch_size, len(ids))
            batch_texts = documents[i:batch_end]
            batch_embeddings = self._embed(batch_texts)

            collection.add(
                ids=ids[i:batch_end],
                documents=batch_texts,
                metadatas=metadatas[i:batch_end],
                embeddings=batch_embeddings,
            )

        # Store metadata
        created_at = datetime.now(timezone.utc).isoformat()
        self._meta_collection.upsert(
            ids=[document_id],
            documents=[title],
            metadatas=[
                {
                    "title": title,
                    "url": url,
                    "page_count": page_count,
                    "chunk_count": len(chunks),
                    "collection_name": collection_name,
                    "created_at": created_at,
                }
            ],
        )

        return {
            "id": document_id,
            "title": title,
            "url": url,
            "page_count": page_count,
            "chunk_count": len(chunks),
            "created_at": created_at,
        }

    # ------------------------------------------------------------------
    # Hybrid Search  (semantic + keyword)
    # ------------------------------------------------------------------
    def search(
        self,
        query: str,
        document_ids: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        """Hybrid search: semantic (OpenAI embeddings) + keyword scoring."""
        # Determine which collections to search
        if document_ids:
            collections_to_search = []
            for doc_id in document_ids:
                col_name = self._get_collection_name(doc_id)
                try:
                    col = self.client.get_collection(col_name)
                    collections_to_search.append(col)
                except Exception:
                    logger.warning(
                        f"Collection not found for document: {doc_id}"
                    )
        else:
            all_collections = self.client.list_collections()
            collections_to_search = []
            for col in all_collections:
                # list_collections() may return Collection objects or strings
                col_name = col if isinstance(col, str) else col.name
                if col_name != "document_metadata" and col_name.startswith("doc_"):
                    try:
                        collection = self.client.get_collection(col_name)
                        collections_to_search.append(collection)
                    except Exception:
                        logger.warning(f"Could not get collection: {col_name}")

        # Embed the query once
        query_embedding = self._embed([query])[0]

        # Fetch more candidates than needed so we can rerank
        fetch_k = max(top_k * 3, self.settings.search_top_k)

        raw_results: list[dict] = []

        for collection in collections_to_search:
            try:
                count = collection.count()
                if count == 0:
                    continue
                search_k = min(fetch_k, count)

                search_results = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=search_k,
                    include=["documents", "metadatas", "distances"],
                )

                if search_results and search_results["documents"]:
                    for i, doc in enumerate(search_results["documents"][0]):
                        metadata = search_results["metadatas"][0][i]
                        distance = search_results["distances"][0][i]
                        # Use 1/(1+d) for L2 distance — maps [0,∞) → (0,1]
                        semantic_score = 1.0 / (1.0 + distance)

                        raw_results.append({
                            "text": doc,
                            "page": metadata.get("page_number", 0),
                            "document_title": metadata.get(
                                "document_title", "Unknown"
                            ),
                            "document_id": metadata.get(
                                "document_id", "unknown"
                            ),
                            "semantic_score": semantic_score,
                        })
            except Exception as e:
                logger.error(f"Error searching collection: {e}")

        # Hybrid scoring: 0.75 semantic + 0.25 keyword
        for r in raw_results:
            kw = _keyword_score(query, r["text"])
            r["score"] = round(0.75 * r["semantic_score"] + 0.25 * kw, 4)

        # Filter by minimum relevance
        min_score = self.settings.min_relevance_score
        filtered = [r for r in raw_results if r["score"] >= min_score]

        # Sort descending
        filtered.sort(key=lambda x: x["score"], reverse=True)

        # Remove internal field before returning
        for r in filtered:
            r.pop("semantic_score", None)

        return filtered[:top_k]

    # ------------------------------------------------------------------
    # CRUD helpers (unchanged logic, cleaned up)
    # ------------------------------------------------------------------
    def get_all_documents(self) -> list[dict]:
        if not self._meta_collection or self._meta_collection.count() == 0:
            return []

        all_docs = self._meta_collection.get(
            include=["metadatas", "documents"]
        )

        documents = []
        for i, doc_id in enumerate(all_docs["ids"]):
            metadata = all_docs["metadatas"][i]
            documents.append({
                "id": doc_id,
                "title": metadata.get("title", all_docs["documents"][i]),
                "url": metadata.get("url", ""),
                "page_count": metadata.get("page_count", 0),
                "chunk_count": metadata.get("chunk_count", 0),
                "created_at": metadata.get("created_at", ""),
            })
        return documents

    def get_document(self, document_id: str) -> dict | None:
        try:
            result = self._meta_collection.get(
                ids=[document_id],
                include=["metadatas", "documents"],
            )
            if result and result["ids"]:
                metadata = result["metadatas"][0]
                return {
                    "id": document_id,
                    "title": metadata.get("title", result["documents"][0]),
                    "url": metadata.get("url", ""),
                    "page_count": metadata.get("page_count", 0),
                    "chunk_count": metadata.get("chunk_count", 0),
                    "created_at": metadata.get("created_at", ""),
                }
        except Exception:
            pass
        return None

    def delete_document(self, document_id: str) -> bool:
        try:
            col_name = self._get_collection_name(document_id)
            try:
                self.client.delete_collection(col_name)
            except Exception:
                logger.warning(
                    f"Collection {col_name} not found for deletion"
                )
            try:
                self._meta_collection.delete(ids=[document_id])
            except Exception:
                pass
            return True
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            return False

    def get_document_count(self) -> int:
        if not self._meta_collection:
            return 0
        return self._meta_collection.count()

    def is_healthy(self) -> bool:
        try:
            self.client.heartbeat()
            return True
        except Exception:
            return False


vector_store = VectorStoreService()
