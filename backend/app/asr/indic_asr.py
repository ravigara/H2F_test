import os
from transformers import AutoModel
import torch
import torchaudio

from ..logger import get_logger

log = get_logger("asr.indic")

device = "cuda" if torch.cuda.is_available() else "cpu"

_model = None


def _load_model():
    """Lazy-load the Indic ASR model."""
    global _model
    if _model is None:
        log.info(f"Loading Indic ASR model on {device}...")
        try:
            _model = AutoModel.from_pretrained(
                "ai4bharat/indic-conformer-600m-multilingual",
                trust_remote_code=True,
            ).to(device)
            log.info("Indic ASR model loaded successfully")
        except Exception as e:
            log.error(f"Failed to load Indic ASR model: {e}")
            raise
    return _model


def preprocess_audio(audio_path: str):
    """Load and preprocess audio for Indic ASR.

    - Validates file exists and has content
    - Converts to mono
    - Resamples to 16kHz
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    file_size = os.path.getsize(audio_path)
    if file_size < 1000:
        raise ValueError(f"Audio file too small ({file_size} bytes): {audio_path}")

    wav, sr = torchaudio.load(audio_path)

    # Convert to mono
    wav = torch.mean(wav, dim=0, keepdim=True)

    # Resample to 16kHz if needed
    if sr != 16000:
        resampler = torchaudio.transforms.Resample(sr, 16000)
        wav = resampler(wav)

    return wav.to(device)


def transcribe_indic(audio_path: str, lang: str = "hi") -> str:
    """Transcribe audio using Indic ASR for the given language.

    Args:
        audio_path: Path to the WAV audio file.
        lang: Language code ('hi' for Hindi, 'kn' for Kannada).

    Returns:
        Transcribed text, or empty string on failure.
    """
    try:
        model = _load_model()
        wav = preprocess_audio(audio_path)

        with torch.no_grad():
            text = model(wav, lang, "rnnt")

        result = text.strip() if isinstance(text, str) else str(text).strip()
        log.info(f"Indic ASR [{lang}]: '{result[:80]}...'")
        return result

    except FileNotFoundError as e:
        log.error(str(e))
        return ""
    except ValueError as e:
        log.error(str(e))
        return ""
    except Exception as e:
        log.error(f"Indic ASR [{lang}] failed for {audio_path}: {e}")
        return ""