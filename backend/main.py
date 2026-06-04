import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import documents, query, health
from services.vector_store import vector_store
from services.llm_service import llm_service

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, cleanup on shutdown."""
    logger.info("Starting Legal Document Analysis API...")

    # Initialize ChromaDB
    vector_store.initialize()

    # Initialize LLM service
    llm_service.initialize()

    logger.info("All services initialized successfully")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Legal Document Analysis API",
    description=(
        "AI-powered legal document analysis with semantic search "
        "and GPT-powered insights"
    ),
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(documents.router)
app.include_router(query.router)
app.include_router(health.router)


@app.get("/")
async def root():
    return {
        "message": "Legal Document Analysis API",
        "docs": "/docs",
        "health": "/api/health"
    }
