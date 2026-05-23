"""Merge Whisper transcript segments with pyannote speaker turns."""

from __future__ import annotations

from dataclasses import dataclass

from app.diarization import Turn
from app.transcription import Segment


@dataclass
class SpeakerSegment:
    start: float
    end: float
    text: str
    speaker: str | None


def assign_speakers(segments: list[Segment], turns: list[Turn]) -> list[SpeakerSegment]:
    """For each transcript segment, assign the speaker whose turn overlaps it most."""
    out: list[SpeakerSegment] = []
    for seg in segments:
        best_speaker: str | None = None
        best_overlap = 0.0
        for turn in turns:
            overlap = max(0.0, min(seg.end, turn.end) - max(seg.start, turn.start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = turn.speaker
        out.append(SpeakerSegment(start=seg.start, end=seg.end, text=seg.text, speaker=best_speaker))
    return out
