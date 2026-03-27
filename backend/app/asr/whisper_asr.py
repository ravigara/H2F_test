import whisper
import torch

from ..logger import get_logger

log = get_logger("asr.whisper")

device = "cuda" if torch.cuda.is_available() else "cpu"

_model = None


def _load_model():
    """Lazy-load the Whisper model."""
    global _model
    if _model is None:
        log.info(f"Loading Whisper model on {device}...")
        try:
            _model = whisper.load_model("base").to(device)
            log.info("Whisper model loaded successfully")
        except Exception as e:
            log.error(f"Failed to load Whisper model: {e}")
            raise
    return _model


def transcribe_english(audio_path: str) -> str:
    """Transcribe audio using Whisper (optimized for English).

    Returns empty string on failure instead of crashing.
    """
    try:
        model = _load_model()
        result = model.transcribe(audio_path)
        text = result.get("text", "").strip()
        log.info(f"Whisper transcription: '{text[:80]}...'")
        return text
    except Exception as e:
        log.error(f"Whisper transcription failed for {audio_path}: {e}")
        return ""


def transcribe_with_language(audio_path: str) -> tuple:
    """Transcribe audio using Whisper with language detection.

    Returns (text, detected_language_code).
    """
    try:
        model = _load_model()
        result = model.transcribe(audio_path)
        text = result.get("text", "").strip()
        lang = result.get("language", "en")
        log.info(f"Whisper transcription [{lang}]: '{text[:80]}...'")
        return text, lang
    except Exception as e:
        log.error(f"Whisper transcription failed for {audio_path}: {e}")
        return "", "en"