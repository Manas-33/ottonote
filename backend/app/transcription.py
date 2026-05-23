"""faster-whisper transcription. Lazy-loads the model on first use."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from faster_whisper import WhisperModel

from app.config import settings


@dataclass
class Segment:
    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    language: str
    language_probability: float
    duration: float
    segments: list[Segment]


@lru_cache(maxsize=1)
def _get_model() -> WhisperModel:
    """Load the Whisper model once. Apple Silicon: CPU + int8 is fastest."""
    return WhisperModel(
        settings.whisper_model,
        device="cpu",
        compute_type=settings.whisper_compute_type,
    )


def _transcribe_sync(path: Path) -> TranscriptionResult:
    model = _get_model()
    segments_iter, info = model.transcribe(
        str(path),
        vad_filter=True,  # Silero VAD — skips silence
        beam_size=1,  # faster; bump to 5 for quality
    )
    segments = [Segment(start=s.start, end=s.end, text=s.text.strip()) for s in segments_iter]
    return TranscriptionResult(
        language=info.language,
        language_probability=info.language_probability,
        duration=info.duration,
        segments=segments,
    )


async def transcribe_file(path: Path) -> TranscriptionResult:
    """Run transcription in a worker thread so we don't block the event loop."""
    return await asyncio.to_thread(_transcribe_sync, path)
