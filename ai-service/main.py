"""
wacrm-ai  —  STT (faster-whisper) + TTS (gTTS) microservice.
No LLM here: the Node.js engine calls Groq/Ollama directly.

Endpoints
  POST /stt   multipart audio file  → {"text": "...", "language": "en"}
  POST /tts   {"text":"...", "voice":"en"} → audio/mpeg
  GET  /health → {"status":"ok"}
"""

import io
import os
import tempfile

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from faster_whisper import WhisperModel
from gtts import gTTS

app = FastAPI(title="wacrm-ai")

# Load Whisper once at startup — tiny is ~75 MB, runs on CPU in ~3-8s per clip
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny")
_whisper: WhisperModel | None = None

def get_whisper() -> WhisperModel:
    global _whisper
    if _whisper is None:
        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper

@app.on_event("startup")
async def startup():
    get_whisper()


# ---------------------------------------------------------------------------
# STT
# ---------------------------------------------------------------------------
@app.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """Transcribe an audio file (OGG/MP3/M4A) to text."""
    suffix = "." + (audio.filename or "audio.ogg").rsplit(".", 1)[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        model = get_whisper()
        segments, info = model.transcribe(
            tmp_path,
            beam_size=1,
            vad_filter=True,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return {"text": text, "language": info.language}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# TTS  (gTTS — Google Translate TTS, free, works on VPS, no API key)
# ---------------------------------------------------------------------------
# Languages gTTS supports well; anything else falls back to English
GTTS_SUPPORTED = {
    'hi', 'mr', 'ta', 'te', 'kn', 'bn', 'gu', 'pa', 'ml', 'ur',  # Indic
    'en', 'fr', 'de', 'es', 'pt', 'ar', 'zh', 'ja', 'ko',         # others
}

class TTSRequest(BaseModel):
    text: str
    voice: str = "en"   # ISO 639-1 language code returned by Whisper

@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    """Convert text to speech. Returns audio/mpeg bytes."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    # Normalise 'hi-IN' → 'hi', unknown → 'en'
    lang = req.voice.lower().split('-')[0]
    if lang not in GTTS_SUPPORTED:
        lang = 'en'
    # Indian English accent for English, standard for other languages
    tld = "co.in" if lang == "en" else "com"
    try:
        tts = gTTS(text=req.text, lang=lang, tld=tld, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        audio_bytes = buf.getvalue()
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "whisper_model": WHISPER_MODEL}
