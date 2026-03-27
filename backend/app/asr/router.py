import asyncio
import re
from dataclasses import dataclass, field
from typing import Set

from .whisper_asr import transcribe_english, transcribe_with_language
from .indic_asr import transcribe_indic
from ..language import detect_scripts, is_code_mixed, get_dominant_language
from ..logger import get_logger

log = get_logger("asr.router")


@dataclass
class CodeMixedResult:
    """Result from code-mixed ASR pipeline."""

    text: str
    languages: Set[str] = field(default_factory=lambda: {"en"})
    is_code_mixed: bool = False
    dominant_language: str = "en"
    segments: list = field(default_factory=list)


def _is_mostly_ascii(text: str) -> bool:
    """Check if text is mostly ASCII characters."""
    if not text:
        return True
    ascii_count = sum(1 for c in text if ord(c) < 128)
    return ascii_count / len(text) > 0.9


def _score_text(text: str) -> int:
    """Score transcription quality based on length and cleanliness."""
    text = text.strip()
    if not text:
        return 0

    length_score = len(text)
    weird_chars = len(re.findall(r"[^\w\s.,!?'\"-]", text))
    penalty = weird_chars * 2

    return max(0, length_score - penalty)


def _merge_transcriptions(
    whisper_text: str, hi_text: str, kn_text: str
) -> tuple:
    """Merge transcriptions from multiple ASR engines.

    For code-mixed speech, Whisper captures the English parts well,
    while Indic ASR captures Hindi/Kannada. This function picks the
    best overall transcription based on scoring.

    Returns: (best_text, languages_set)
    """
    scores = {
        "whisper": _score_text(whisper_text),
        "hi": _score_text(hi_text),
        "kn": _score_text(kn_text),
    }

    log.info(f"Scores — Whisper: {scores['whisper']}, Hindi: {scores['hi']}, Kannada: {scores['kn']}")

    # Detect what languages Whisper's output contains
    whisper_langs = detect_scripts(whisper_text) if whisper_text else set()

    # If Whisper output contains Indic-like transliterated words,
    # it's code-mixed and Whisper captured it well
    if whisper_text and is_code_mixed(whisper_text):
        log.info("Code-mixed speech detected in Whisper output")
        return whisper_text.strip(), whisper_langs

    # If Whisper is significantly better, use it
    if scores["whisper"] > max(scores["hi"], scores["kn"]) * 1.5:
        return whisper_text.strip(), whisper_langs

    # If Hindi is best
    if scores["hi"] >= scores["kn"] and scores["hi"] > scores["whisper"] * 0.7:
        # Check if mixing Hindi text with some English from Whisper works better
        combined_langs = detect_scripts(hi_text)
        if "en" in whisper_langs:
            combined_langs.add("en")
        return hi_text.strip(), combined_langs

    # If Kannada is best
    if scores["kn"] > scores["hi"] and scores["kn"] > scores["whisper"] * 0.7:
        combined_langs = detect_scripts(kn_text)
        if "en" in whisper_langs:
            combined_langs.add("en")
        return kn_text.strip(), combined_langs

    # Fallback: use the longest transcription
    best = max(
        [(whisper_text, whisper_langs), (hi_text, detect_scripts(hi_text)), (kn_text, detect_scripts(kn_text))],
        key=lambda x: len(x[0].strip()) if x[0] else 0,
    )
    return best[0].strip(), best[1]


class ASRRouter:
    """Routes audio to the best ASR engine(s) and handles code-mixed speech."""

    async def transcribe(self, audio_path: str) -> tuple:
        """Transcribe audio, handling code-mixed Hindi-English-Kannada.

        Returns (text, language_code) for backward compatibility.
        """
        result = await self.transcribe_full(audio_path)
        return result.text, result.dominant_language

    async def transcribe_full(self, audio_path: str) -> CodeMixedResult:
        """Full code-mixed transcription pipeline.

        Steps:
        1. Run Whisper first (fast, good for English + code-mixed)
        2. If purely English, return immediately
        3. Otherwise run Indic ASR for Hindi and Kannada
        4. Merge results and detect code-mixing

        Returns a CodeMixedResult with full language info.
        """
        loop = asyncio.get_event_loop()

        # Step 1: Whisper transcription
        log.info("Running Whisper ASR...")
        whisper_text = await loop.run_in_executor(None, transcribe_english, audio_path)
        log.info(f"Whisper output: '{whisper_text[:100]}'")

        clean_text = whisper_text.strip()

        # Step 2: Fast path — pure English
        if (
            _is_mostly_ascii(clean_text)
            and len(clean_text.split()) > 3
            and not is_code_mixed(clean_text)
        ):
            log.info("Pure English detected, skipping Indic ASR")
            return CodeMixedResult(
                text=clean_text,
                languages={"en"},
                is_code_mixed=False,
                dominant_language="en",
            )

        # Step 3: Run Indic ASR for both Hindi and Kannada
        log.info("Running Indic ASR (Hindi + Kannada)...")

        hi_text = await loop.run_in_executor(
            None, transcribe_indic, audio_path, "hi"
        )
        kn_text = await loop.run_in_executor(
            None, transcribe_indic, audio_path, "kn"
        )

        log.info(f"Hindi ASR: '{hi_text[:80]}'")
        log.info(f"Kannada ASR: '{kn_text[:80]}'")

        # Step 4: Merge and detect code-mixing
        best_text, languages = _merge_transcriptions(whisper_text, hi_text, kn_text)
        languages.discard("unknown")

        if not languages:
            languages = {"en"}

        dominant = get_dominant_language(best_text, languages.copy())
        mixed = len(languages) > 1

        result = CodeMixedResult(
            text=best_text,
            languages=languages,
            is_code_mixed=mixed,
            dominant_language=dominant,
            segments=[
                {"engine": "whisper", "text": whisper_text.strip()},
                {"engine": "indic_hi", "text": hi_text.strip()},
                {"engine": "indic_kn", "text": kn_text.strip()},
            ],
        )

        log.info(
            f"Final: '{result.text[:80]}' | "
            f"Languages: {result.languages} | "
            f"Code-mixed: {result.is_code_mixed}"
        )

        return result