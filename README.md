# Lexicon — Talk to your PDFs

A retrieval-augmented assistant for PDF documents. Upload a file, ask anything in plain language — Lexicon retrieves the right passages and streams an answer grounded in them.

**Frontend live:** _add Vercel URL_  ·  **API live:** _add Railway URL_

---

## What this demonstrates

| AI Engineer skill | Where it shows up |
|---|---|
| **Chunking** | `backend/services/chunker.py` — recursive splitter with overlap |
| **Embeddings** | OpenAI `text-embedding-3` stored in ChromaDB |
| **Vector retrieval** | Top-k similarity + per-document metadata filter |
| **Streaming generation** | FastAPI Server-Sent Events → React `EventSource` |
| **Grounded prompts** | System prompt forces citation of retrieved chunks |

## Stack

- **Backend:** FastAPI · ChromaDB · OpenAI SDK · pypdf
- **Frontend:** React 19 + Vite · TypeScript (Inter + Newsreader display font)

## Run locally

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # add OPENAI_API_KEY
uvicorn main:app --reload  # http://localhost:8000

# Frontend (new shell)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## Deploy

- **Backend → Railway / Fly.io:** push the repo, point the service at `backend/Dockerfile`. ChromaDB persists in `chroma_data/` — mount a volume.
- **Frontend → Vercel:** import the repo, set the root to `frontend/`. The provided `vercel.json` handles SPA routing. Set `VITE_API_URL` to the backend URL.

## File map

```
backend/
  main.py                 # FastAPI app + lifespan
  routers/                # documents, query, health
  services/               # vector_store, llm_service, chunking
  Dockerfile · railway.toml
frontend/
  src/
    components/
      Landing.tsx         # Hero + how-it-works
      Header.tsx          # Lexicon brand
      DocumentUpload.tsx
      DocumentList.tsx
      QueryInterface.tsx  # Streamed RAG answers
    index.css             # Lexicon theme (slate × violet × amber)
```

---

> Built as part of an AI Engineer portfolio.
