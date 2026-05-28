"""
wacrm-ai  —  STT (faster-whisper) + TTS (gTTS) microservice.
No LLM here: the Node.js engine calls Groq/Ollama directly.

Endpoints
  POST /stt   multipart audio file  → {"text": "...", "language": "en"}
  POST /tts   {"text":"...", "voice":"en"} → audio/mpeg
  GET  /health → {"status":"ok"}
"""

import base64
import io
import os
import subprocess
import tempfile

import httpx
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
        print(f"[STT] detected language: {info.language} (confidence: {info.language_probability:.2f})")
        return {"text": text, "language": info.language}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# TTS  (gTTS — Google Translate TTS, free, works on VPS, no API key)
# ---------------------------------------------------------------------------
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")

# Indic languages → Sarvam AI (female meera voice, best quality)
SARVAM_LANG_MAP = {
    'hi': 'hi-IN', 'mr': 'mr-IN', 'ta': 'ta-IN',
    'te': 'te-IN', 'kn': 'kn-IN', 'bn': 'bn-IN',
    'gu': 'gu-IN', 'pa': 'pa-IN', 'ml': 'ml-IN',
    'or': 'od-IN', 'ur': 'ur-IN',
}

# Non-Indic languages gTTS handles well
GTTS_SUPPORTED = {'en', 'fr', 'de', 'es', 'pt', 'ar', 'zh', 'ja', 'ko'}

class TTSRequest(BaseModel):
    text: str
    voice: str = "en"   # ISO 639-1 language code returned by Whisper

@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    """Convert text to speech. Returns audio/mpeg bytes."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    lang = req.voice.lower().split('-')[0]  # 'hi-IN' → 'hi'

    # Route Indic languages to Sarvam AI for a natural female voice
    if lang in SARVAM_LANG_MAP and SARVAM_API_KEY:
        try:
            return await _sarvam_tts(req.text, lang)
        except Exception as err:
            print(f"[TTS] Sarvam failed ({err}), falling back to gTTS")

    # Fallback: gTTS for English and other languages
    if lang not in GTTS_SUPPORTED:
        lang = 'en'
    tld = "co.in" if lang == "en" else "com"
    try:
        tts = gTTS(text=req.text, lang=lang, tld=tld, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        return Response(content=buf.getvalue(), media_type="audio/mpeg")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


async def _sarvam_tts(text: str, lang: str) -> Response:
    """Sarvam AI TTS — natural Indian female voice (meera). Returns audio/mpeg."""
    sarvam_lang = SARVAM_LANG_MAP[lang]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.sarvam.ai/text-to-speech",
            headers={"api-subscription-key": SARVAM_API_KEY},
            json={
                "inputs": [text],
                "target_language_code": sarvam_lang,
                "speaker": "anushka",
                "pitch": 0,
                "pace": 1.1,
                "loudness": 1.5,
                "speech_sample_rate": 8000,
                "enable_preprocessing": True,
                "model": "bulbul:v2",
            },
            timeout=30.0,
        )
    resp.raise_for_status()
    wav_bytes = base64.b64decode(resp.json()["audios"][0])

    # Sarvam returns WAV — convert to MP3 via ffmpeg (already in container for whisper)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wf:
        wf.write(wav_bytes)
        wav_path = wf.name
    mp3_path = wav_path.replace(".wav", ".mp3")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "4", mp3_path],
            check=True, capture_output=True,
        )
        with open(mp3_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/mpeg")
    finally:
        os.unlink(wav_path)
        if os.path.exists(mp3_path):
            os.unlink(mp3_path)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "whisper_model": WHISPER_MODEL}
