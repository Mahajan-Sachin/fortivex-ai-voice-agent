"""Idiomatic LangChain + ChromaDB async RAG retriever over Fortivex AI knowledge."""

import json
from functools import lru_cache

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

from app.config import DATA_DIR

KB_PATH = DATA_DIR / "knowledge_base.json"
CHROMA_DIR = DATA_DIR / "chroma_db"


@lru_cache(maxsize=1)
def get_retriever():
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)

    vectorstore = Chroma(
        collection_name="fortivex_knowledge",
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )

    if vectorstore._collection.count() == 0:
        raw = json.loads(KB_PATH.read_text(encoding="utf-8"))
        docs = [
            Document(
                page_content=f"{item['title']}\n{item['content']}",
                metadata={"id": item["id"], "title": item["title"]},
            )
            for item in raw
        ]
        vectorstore.add_documents(docs)

    return vectorstore.as_retriever(search_kwargs={"k": 3})


async def asearch(query: str) -> str:
    docs = await get_retriever().ainvoke(query)
    return "\n\n".join(f"[{d.metadata.get('title', 'Doc')}]\n{d.page_content}" for d in docs)
