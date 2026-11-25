# Fortivex AI — Autonomous Sales & Concierge Voice Agent

An **Autonomous AI Sales & Concierge Voice Agent** built for **Fortivex AI Private Limited**'s 5-vertical ecosystem (**Custom AI Engineering**, **Fortivex CRM**, **Empowers Academy**, **Medivex AI**, and **FAMS**).

## Key Features
- **Real-Time Multilingual Voice Loop:** Groq Whisper (`whisper-large-v3-turbo`) STT + `edge-tts` neural TTS across English, Hindi, Spanish, French, and Arabic.
- **LangGraph Agentic Workflow:** Stateful `StateGraph` (`retrieve_rag` → `reason_and_extract` → `crm_and_book`) using `ChatGroq.with_structured_output()`.
- **Multi-Key & Model Failover:** Automatic rotation across 4 Groq API keys (`key1`–`key4`) and model fallback (`openai/gpt-oss-120b` → `openai/gpt-oss-20b`).
- **ChromaDB RAG:** Grounded retrieval over Fortivex AI's real products, hubs (Bengaluru & Dubai), and security architecture.
- **Live CRM & Atomic Booking:** Extracts lead fields, scores intent (`Hot` / `Warm` / `Cold`), tracks sentiment, prevents double-booking via `asyncio.Lock`, and logs call summaries.

## Project Docs
- **1-Page Report:** [REPORT.md](REPORT.md)
- **System Architecture Diagrams:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Design & 18 Production Edge Cases:** [docs/DESIGN_AND_EDGE_CASES.md](docs/DESIGN_AND_EDGE_CASES.md)

## Quick Start

### 1. Backend (`langgraph_env` / Python 3.11)
```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (React + Vite)
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

