"""
wacrm-ai  —  STT (faster-whisper) + TTS (edge-tts) microservice.
No LLM here: the Node.js engine calls Ollama directly.

Endpoints
  POST /stt   multipart audio file  → {"text": "...", "language": "en"}
  POST /tts   {"text":"...", "voice":"en-IN-NeerjaNeural"} → audio/mpeg
  GET  /health → {"status":"ok"}
"""

import asyncio
import os
import tempfile

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from faster_whisper import WhisperModel
import edge_tts

app = FastAPI(title="wacrm-ai")

# Load Whisper once at startup — tiny is ~75 MB, runs on CPU in ~3-8s per clip
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny")
_whisper: WhisperModel | None = None

def get_whisper() -> WhisperModel:
    global _whisper
    if _whisper is None:
        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper

# Pre-load at startup so the first real request isn't slow
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
            language="en",
            beam_size=1,
            vad_filter=True,          # skip silent sections
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return {"text": text, "language": info.language}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------
class TTSRequest(BaseModel):
    text: str
    # en-IN voices: NeerjaNeural (female), PrabhatNeural (male)
    voice: str = "en-IN-NeerjaNeural"

@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    """Convert text to speech. Returns audio/mpeg bytes."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
        out_path = tmp.name
    try:
        communicate = edge_tts.Communicate(req.text, req.voice)
        await communicate.save(out_path)
        with open(out_path, "rb") as f:
            audio_bytes = f.read()
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "whisper_model": WHISPER_MODEL}
