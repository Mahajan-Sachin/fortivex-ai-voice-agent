"""Pure-asyncio FastAPI server for the Fortivex AI Autonomous Sales Voice Agent."""

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agent import run_sales_turn
from app.config import keys_summary
from app.store import GREETING_TEXT, OFFICE_WINDOWS, crm_store
from app.voice import synthesize_speech_base64, transcribe_audio

app = FastAPI(title="Fortivex AI Sales Voice Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TextTurnRequest(BaseModel):
    session_id: str | None = None
    text: str
    language: str = "en"
    speak: bool = True


class EndCallRequest(BaseModel):
    session_id: str


async def _process_turn(
    session: dict,
    user_text: str,
    language: str,
    *,
    speak: bool = True,
    stt_key: str | None = None,
) -> dict:
    reply_text, turn_output = await run_sales_turn(session, user_text, language)
    audio_b64 = await synthesize_speech_base64(reply_text, language) if speak else ""
    updated = await crm_store.save_turn(session["session_id"], user_text, reply_text, language, turn_output)
    return {
        "session_id": updated["session_id"],
        "user_text": user_text,
        "assistant_text": reply_text,
        "language": language,
        "stt_key": stt_key,
        "audio_base64": audio_b64,
        "session": updated,
        "office_windows": OFFICE_WINDOWS,
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "groq_pool": keys_summary(),
        "office_windows": OFFICE_WINDOWS,
    }


@app.post("/api/session")
async def create_session():
    session = await crm_store.create_session()
    greeting_audio = await synthesize_speech_base64(GREETING_TEXT, "en")
    return {"session": session, "office_windows": OFFICE_WINDOWS, "greeting_audio": greeting_audio}


@app.post("/api/voice-turn")
async def voice_turn(audio: UploadFile = File(...), session_id: str | None = Form(default=None)):
    session = await crm_store.get_or_create(session_id)
    audio_bytes = await audio.read()
    async with crm_store.session_lock(session["session_id"]):
        try:
            user_text, lang, stt_key = await transcribe_audio(audio_bytes, filename=audio.filename or "recording.webm")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return await _process_turn(session, user_text, lang, speak=True, stt_key=stt_key)


@app.post("/api/text-turn")
async def text_turn(req: TextTurnRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text cannot be empty.")
    session = await crm_store.get_or_create(req.session_id)
    async with crm_store.session_lock(session["session_id"]):
        return await _process_turn(session, text, req.language, speak=req.speak)


@app.post("/api/end-call")
async def end_call(req: EndCallRequest):
    if req.session_id not in crm_store.sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    async with crm_store.session_lock(req.session_id):
        updated = await crm_store.end_session(req.session_id)
    return {"session": updated, "crm": await crm_store.crm_snapshot()}


@app.get("/api/crm")
async def get_crm():
    return await crm_store.crm_snapshot()
