"""Pure-asyncio STT (Groq Whisper with key failover) and TTS (edge-tts)."""

import base64
import io

import edge_tts
from groq import AsyncGroq

from app.config import FALLBACK_STT_MODEL, PRIMARY_STT_MODEL, STT_KEY_ORDER

VOICE_MAP = {
    "en": "en-IN-NeerjaNeural",
    "hi": "hi-IN-SwaraNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "ar": "ar-AE-FatimaNeural",
}

SILENCE_ARTIFACTS = {
    "thank you", "thank you.", "thanks for watching", "thanks for watching.",
    "bye.", "you", ".", "the", "a", "uh", "um", "hmm", "oh",
}


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> tuple[str, str, str]:
    """Transcribe audio via AsyncGroq Whisper across STT_KEY_ORDER + fallback model."""
    if len(audio_bytes) < 1500:
        raise ValueError("Audio clip too short or silent. Please hold the mic and speak clearly.")

    last_err: Exception | None = None
    for model in (PRIMARY_STT_MODEL, FALLBACK_STT_MODEL):
        for key_name, api_key in STT_KEY_ORDER:
            client = AsyncGroq(api_key=api_key, timeout=20.0, max_retries=0)
            try:
                bio = io.BytesIO(audio_bytes)
                bio.name = filename
                resp = await client.audio.transcriptions.create(
                    file=bio,
                    model=model,
                    response_format="verbose_json",
                )
                text = (getattr(resp, "text", "") or "").strip()
                lang = (getattr(resp, "language", "en") or "en").lower()[:2]
                if not text or text.lower() in SILENCE_ARTIFACTS:
                    raise ValueError("No clear speech detected. Please try speaking again.")
                return text, lang, key_name
            except ValueError:
                raise
            except Exception as exc:  # noqa: BLE001 - rotate on rate limit or transient API error
                last_err = exc
                continue
            finally:
                await client.close()

    raise RuntimeError(f"All STT keys/models failed: {last_err}")


async def synthesize_speech_base64(text: str, language: str = "en") -> str:
    """Convert assistant reply to MP3 base64 using async edge-tts."""
    voice = VOICE_MAP.get(language.lower()[:2], VOICE_MAP["en"])
    communicate = edge_tts.Communicate(text=text, voice=voice)
    chunks = [chunk["data"] async for chunk in communicate.stream() if chunk["type"] == "audio"]
    return base64.b64encode(b"".join(chunks)).decode("ascii")
