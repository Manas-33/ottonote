"""pyannote speaker diarization. Lazy-loads the pipeline on first use."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pyannote.audio import Pipeline

from app.config import settings


@dataclass
class Turn:
    start: float
    end: float
    speaker: str


@lru_cache(maxsize=1)
def _get_pipeline() -> Pipeline:
    if not settings.hf_token:
        raise RuntimeError(
            "HF_TOKEN is not set. Add it to .env (read scope) and accept terms for "
            "pyannote/speaker-diarization-3.1 and pyannote/segmentation-3.0."
        )
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-community-1",
        token=settings.hf_token,
    )
    return pipeline


def _diarize_sync(path: Path) -> list[Turn]:
    pipeline = _get_pipeline()
    output = pipeline(str(path))
    # v4 returns DiarizeOutput. Use exclusive_speaker_diarization so no two
    # speakers overlap at the same instant — cleaner for transcript merging.
    annotation = output.exclusive_speaker_diarization
    turns: list[Turn] = []
    for segment, _, speaker in annotation.itertracks(yield_label=True):
        turns.append(Turn(start=segment.start, end=segment.end, speaker=speaker))
    return turns


async def diarize_file(path: Path) -> list[Turn]:
    return await asyncio.to_thread(_diarize_sync, path)
