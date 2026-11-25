# Project Report: Autonomous AI Sales & Concierge Voice Agent for Fortivex AI

## 1. Business Problem & Solution
**Fortivex AI Private Limited** operates five distinct verticals—**Custom AI & Software Engineering**, **Fortivex CRM**, **Empowers Academy**, **Medivex AI**, and **Fortivex Attendance Management System (FAMS)**—across Bengaluru and Dubai hubs. Prospective clients and learners exploring the ecosystem face choice overload and multi-product collisions (for example, an EdTech startup needing CRM, FAMS, and AI curriculum simultaneously), while manual lead qualification slows response times.

**Solution:** **Aria**, an Autonomous AI Sales & Concierge Voice Agent built with a pure-`asyncio` **FastAPI + LangGraph** backend and a **React** live CRM dashboard. It conducts multilingual voice conversations, retrieves grounded product facts via **RAG (ChromaDB)**, resolves multi-product collisions into a **Custom Integrated Bundle**, qualifies leads (`Hot` / `Warm` / `Cold`) with sentiment analysis, books non-overlapping appointments, and writes structured executive call summaries directly into the CRM pipeline.

---

## 2. Technical Implementation & Key Engineering Decisions
- **Pure-`asyncio` Concurrency (Zero Threads):** Built end-to-end on `asyncio` (`FastAPI`, `AsyncGroq`, `LangGraph ainvoke`, `edge-tts`, `asyncio.Lock`), eliminating thread-switching overhead for I/O-bound voice and LLM pipelines.
- **Resilient Multi-Key Failover (`key1`–`key4`):** Dedicated Groq API keys for LLM (`openai/gpt-oss-120b` → `openai/gpt-oss-20b` via LangChain `.with_fallbacks()`) and STT (`whisper-large-v3-turbo` → `whisper-large-v3`), ensuring zero mid-call drops on `429` rate limits or token exhaustion.
- **Structured Agentic State (LangGraph):** Uses `SalesTurnOutput` Pydantic schema via `.with_structured_output()` to generate the spoken reply, extract CRM fields, score lead intent, detect objections, and trigger atomic slot booking in a single deterministic pass.
- **Production Edge Cases Handled:** Multi-product collision routing, B2C learner vs. B2B enterprise separation, silent/short audio filtering, double-booking prevention via `asyncio.Lock`, deep-merge lead updates across turns, and rolling call summaries for abandoned-call recovery. *(Detailed in [DESIGN_AND_EDGE_CASES.md](docs/DESIGN_AND_EDGE_CASES.md).)*

---

## 3. Scalability Strategy (Up to 1,00,000 Users)
1. **Stateless Compute & Horizontal Auto-Scaling:** Containerize FastAPI workers in Kubernetes behind an AWS ALB with HPA scaling on CPU/RPS; migrate from REST audio upload to **WebRTC / LiveKit** streaming for `< 600ms` time-to-first-audio.
2. **Distributed State & Locking:** Move session memory and appointment locks from in-memory `AsyncCRMStore` to **Redis Cluster** (`redis.asyncio` + Redlock), enabling any worker to serve any turn.
3. **Database & Vector Tier:** Persist CRM records in **PostgreSQL** (`asyncpg` + read replicas) and serve RAG embeddings from **pgvector / Qdrant** with Redis semantic caching for frequent product/pricing queries.
4. **Async Post-Call Pipeline:** Offload CRM webhooks, email confirmations, and analytics aggregation to an async message broker (Kafka / Redis Streams).

---

## 4. Data Security, Deployment & Operational Costs
- **Security & Privacy:** TLS 1.3 in transit, AES-256 encryption at rest, `.env` secrets isolation (managed via AWS Secrets Manager in production), strict tenant isolation, PII redaction in logs, and zero training on customer data.
- **Deployment:** Dockerized FastAPI + React (Nginx/Vercel) on AWS ECS/EKS across Mumbai (`ap-south-1`) and UAE (`me-central-1`) regions for low-latency Bengaluru/Dubai coverage.
- **Estimated Operational Cost (Production at Scale):**
  - **STT (`whisper-large-v3-turbo`):** `$0.04 / hour` (`~$0.00067 / min`)
  - **LLM (`openai/gpt-oss-20b` / `120b`):** `~$0.001 – $0.004 / min` depending on turn length
  - **TTS:** `$0` in prototype (`edge-tts`); `~$0.004 – $0.015 / min` with enterprise managed neural TTS
  - **Total Estimated Cost:** **< $0.01 – $0.02 per call minute**, yielding high commercial ROI compared to humanSDR triage costs.

