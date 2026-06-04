from __future__ import annotations

import json
import logging
from typing import AsyncGenerator
from openai import OpenAI
from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt — comprehensive legal analysis with multi-language support
# ---------------------------------------------------------------------------
LEGAL_SYSTEM_PROMPT = """You are **LegalMind AI**, a senior legal document analyst with expertise in contract law, regulatory compliance, intellectual property, corporate law, and litigation.

## Core Principles
- **Accuracy first**: Every claim must be backed by a citation from the provided excerpts.
- **No hallucination**: If the documents do not contain sufficient information, state that clearly instead of guessing.
- **Language matching**: Respond in the SAME LANGUAGE as the user's query. If the query is in Turkish, answer in Turkish. If in English, answer in English.

## Analysis Instructions
1. Read all provided document excerpts carefully.
2. Identify which excerpts are most relevant to the user's query.
3. Cross-reference information across multiple excerpts when they relate to each other.
4. Identify legal concepts, obligations, rights, risks, deadlines, and conditions.
5. Note any ambiguities, missing information, or clauses that may need professional review.

## Response Structure
Use the following structure (adapt section titles to match the language of the query):

### Summary
A concise 2-3 sentence overview of findings.

### Detailed Analysis
In-depth analysis organized by theme/topic. Use inline citations in the format **[Page X, "Document Title"]**. Quote key phrases directly from the document when they are critical.

### Key Findings
- Bullet points of the most important findings
- Each point should reference the source

### Potential Risks & Considerations
- Flag any risks, ambiguities, or areas of concern
- Note any missing clauses or provisions that would typically be expected

### Recommendations
- Actionable suggestions based on the analysis
- Areas where a human attorney should review

## Citation Rules
- ALWAYS cite with **[Page X, "Document Title"]** format
- When quoting, use the exact text from the excerpt with quotation marks
- If multiple excerpts support a point, cite all of them
- Rank your citations by relevance to the specific claim

IMPORTANT: Base your analysis ONLY on the provided document excerpts. Never make up or assume content not present in the excerpts."""


class LLMService:
    def __init__(self):
        self.settings = get_settings()
        self.client = None

    def initialize(self):
        """Initialize the OpenAI client."""
        self.client = OpenAI(api_key=self.settings.openai_api_key)
        logger.info(
            f"OpenAI client initialized — model: {self.settings.openai_model}"
        )

    # ------------------------------------------------------------------
    # Context building
    # ------------------------------------------------------------------
    def _build_context(self, search_results: list[dict]) -> str:
        """Build a rich context block from search results."""
        parts: list[str] = []
        for i, result in enumerate(search_results, 1):
            score_pct = f"{result['score'] * 100:.0f}%"
            parts.append(
                f"--- Excerpt {i} (Relevance: {score_pct}) ---\n"
                f"Document: \"{result['document_title']}\"\n"
                f"Page: {result['page']}\n"
                f"Content:\n{result['text']}\n"
            )
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------
    async def analyze(
        self,
        query: str,
        search_results: list[dict],
    ) -> dict:
        """Generate legal analysis with structured citations."""

        if not search_results:
            return {
                "answer": (
                    "No relevant document excerpts were found for your query. "
                    "Please ensure you have uploaded relevant documents and "
                    "try rephrasing your question."
                ),
                "citations": [],
            }

        context = self._build_context(search_results)

        user_message = (
            f"## User Query\n{query}\n\n"
            f"## Document Excerpts ({len(search_results)} results)\n"
            f"{context}\n\n"
            f"Provide a comprehensive legal analysis based on these excerpts. "
            f"Remember to respond in the same language as the query."
        )

        try:
            response = self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=[
                    {"role": "system", "content": LEGAL_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=self.settings.llm_temperature,
                max_tokens=self.settings.llm_max_tokens,
            )

            answer = response.choices[0].message.content or ""

            # Build structured citations from search results
            citations = []
            for result in search_results:
                # Include a longer excerpt for better context
                text = result["text"]
                max_citation_len = 500
                citation_text = (
                    text[:max_citation_len] + "..."
                    if len(text) > max_citation_len
                    else text
                )
                citations.append({
                    "text": citation_text,
                    "page": result["page"],
                    "document_title": result["document_title"],
                    "document_id": result["document_id"],
                    "relevance_score": result["score"],
                })

            return {
                "answer": answer,
                "citations": citations,
            }

        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise RuntimeError(f"Failed to generate analysis: {str(e)}")

    # ------------------------------------------------------------------
    # Streaming Analysis  (for /run-agent SSE endpoint)
    # ------------------------------------------------------------------
    async def analyze_stream(
        self,
        query: str,
        search_results: list[dict],
    ) -> AsyncGenerator[str, None]:
        """Stream legal analysis as SSE-compatible JSON lines.

        Yields JSON strings of the form:
          {"type": "chunk",    "content": "..."}      — partial text
          {"type": "citations", "citations": [...]}   — at the end
          {"type": "done"}                            — stream finished
          {"type": "error",   "message": "..."}       — on failure
        """
        if not search_results:
            yield json.dumps({
                "type": "chunk",
                "content": (
                    "İlgili belge bulunamadı. Lütfen doküman yükleyip "
                    "sorunuzu tekrar deneyin."
                ),
            })
            yield json.dumps({"type": "citations", "citations": []})
            yield json.dumps({"type": "done"})
            return

        context = self._build_context(search_results)

        user_message = (
            f"## User Query\n{query}\n\n"
            f"## Document Excerpts ({len(search_results)} results)\n"
            f"{context}\n\n"
            f"Provide a comprehensive legal analysis based on these excerpts. "
            f"Remember to respond in the same language as the query."
        )

        try:
            stream = self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=[
                    {"role": "system", "content": LEGAL_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=self.settings.llm_temperature,
                max_tokens=self.settings.llm_max_tokens,
                stream=True,
            )

            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield json.dumps({
                        "type": "chunk",
                        "content": delta.content,
                    })

            # Send citations after streaming finishes
            citations = []
            for result in search_results:
                text = result["text"]
                max_len = 500
                citations.append({
                    "text": text[:max_len] + "..." if len(text) > max_len else text,
                    "page": result["page"],
                    "document_title": result["document_title"],
                    "document_id": result["document_id"],
                    "relevance_score": result["score"],
                })

            yield json.dumps({"type": "citations", "citations": citations})
            yield json.dumps({"type": "done"})

        except Exception as e:
            logger.error(f"OpenAI streaming error: {e}")
            yield json.dumps({"type": "error", "message": str(e)})


llm_service = LLMService()
