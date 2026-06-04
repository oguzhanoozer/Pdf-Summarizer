from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str = "sk-your-api-key-here"
    openai_model: str = "gpt-4.1"
    embedding_model: str = "text-embedding-3-small"

    # ChromaDB
    chroma_persist_dir: str = "./chroma_data"

    # PDF Processing
    chunk_size: int = 800
    chunk_overlap: int = 200
    max_upload_size_mb: int = 50

    # Search
    search_top_k: int = 10
    rerank_top_k: int = 5
    min_relevance_score: float = 0.15

    # LLM
    llm_temperature: float = 0.1
    llm_max_tokens: int = 4096

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
