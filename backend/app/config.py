"""Configuration, Path-based .env loading, and Groq multi-key failover builders."""

from pathlib import Path
from typing import Type

from dotenv import dotenv_values
from langchain_core.runnables import Runnable
from langchain_groq import ChatGroq
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

PRIMARY_LLM_MODEL = "openai/gpt-oss-120b"
FALLBACK_LLM_MODEL = "openai/gpt-oss-20b"
PRIMARY_STT_MODEL = "whisper-large-v3-turbo"
FALLBACK_STT_MODEL = "whisper-large-v3"


def load_groq_keys() -> list[tuple[str, str]]:
    """Load key1..key4 (or GROQ_API_KEY) from .env using pathlib."""
    env_map = dotenv_values(ROOT_DIR / ".env")
    seen: set[str] = set()
    keys: list[tuple[str, str]] = []
    for name in ("key1", "key2", "key3", "key4", "GROQ_API_KEY"):
        val = (env_map.get(name) or "").strip()
        if val and val not in seen:
            seen.add(val)
            keys.append((name, val))
    if not keys:
        raise RuntimeError("No Groq API keys found in .env (expected key1..key4).")
    return keys


GROQ_KEYS = load_groq_keys()
_mid = max(1, len(GROQ_KEYS) // 2)
LLM_KEY_ORDER = GROQ_KEYS
STT_KEY_ORDER = GROQ_KEYS[_mid:] + GROQ_KEYS[:_mid]


def build_structured_llm(schema: Type[BaseModel], temperature: float = 0.2) -> Runnable:
    """Build a ChatGroq structured-output runnable with native LangChain .with_fallbacks()."""
    candidates = [
        ChatGroq(model=model, api_key=api_key, temperature=temperature, timeout=25.0, max_retries=1)
        .with_structured_output(schema)
        for model in (PRIMARY_LLM_MODEL, FALLBACK_LLM_MODEL)
        for _, api_key in LLM_KEY_ORDER
    ]
    primary, *fallbacks = candidates
    return primary.with_fallbacks(fallbacks) if fallbacks else primary


def keys_summary() -> dict:
    return {
        "total_keys": len(GROQ_KEYS),
        "llm_primary": [k for k, _ in LLM_KEY_ORDER[:2]],
        "stt_primary": [k for k, _ in STT_KEY_ORDER[:2]],
        "models": {
            "llm_primary": PRIMARY_LLM_MODEL,
            "llm_fallback": FALLBACK_LLM_MODEL,
            "stt_primary": PRIMARY_STT_MODEL,
            "stt_fallback": FALLBACK_STT_MODEL,
        },
    }
