#!/usr/bin/env python3
"""Build a realistic two-speaker demo meeting WAV using macOS `say` for TTS.

Run once on macOS. Output: backend/samples/demo_meeting.wav

The dialogue is intentionally dense with extractable content — explicit
decisions, action items with assignees + due dates, and calendar events —
so it exercises the LLM extraction trust pass end-to-end during demos.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_WAV = ROOT / "samples" / "demo_meeting.wav"

# Two distinct voices give pyannote a fighting chance of producing 2 clusters.
SARAH = "Samantha"  # en_US female
JAMES = "Daniel"    # en_GB male

# Spell out tricky values ("March fifteenth", "two PM") so TTS pronounces
# them naturally — Whisper will still transcribe them in word form, which
# is fine for the LLM to parse downstream.
DIALOGUE: list[tuple[str, str]] = [
    (SARAH, "Hey James, thanks for joining. Let's run through the launch plan for the new analytics dashboard."),
    (JAMES, "Sounds good. I think we should target March fifteenth for the public launch."),
    (SARAH, "Agreed. Let's lock in March fifteenth as the official launch date."),
    (JAMES, "Perfect. I'll need the final design specs from you to wrap up the front end."),
    (SARAH, "I'll send you the design specs by Thursday end of day."),
    (JAMES, "Great. We also need to schedule a client review before launch. How about next Tuesday at two PM?"),
    (SARAH, "Next Tuesday at two PM works for me. Can you send the calendar invite to the whole team?"),
    (JAMES, "Yes, I'll send the invite this afternoon."),
    (SARAH, "One more thing — Maria flagged that the API documentation is still incomplete."),
    (JAMES, "I'll follow up with Maria tomorrow morning to get a status update."),
    (SARAH, "Perfect. And we agreed to defer the mobile app to phase two, right?"),
    (JAMES, "Correct. Mobile is pushed to Q3, no change there."),
    (SARAH, "One blocker — the security review hasn't started yet. We should escalate that."),
    (JAMES, "I'll loop in the security team by end of week and report back on Friday."),
    (SARAH, "Okay, I think that covers everything. Thanks James."),
    (JAMES, "Thanks Sarah. Talk soon."),
]


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)

        # Short silence inserted between lines for natural pacing. 16kHz mono
        # matches our pipeline's normalization target, so the final concat
        # can be `-c copy` (no re-encode).
        silence = td_path / "silence.wav"
        _run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
            "-t", "0.4", str(silence),
        ])

        wavs: list[Path] = []
        for i, (voice, text) in enumerate(DIALOGUE):
            aiff = td_path / f"line_{i:02d}.aiff"
            _run(["say", "-v", voice, "-o", str(aiff), text])
            wav = td_path / f"line_{i:02d}.wav"
            _run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", str(aiff), "-ac", "1", "-ar", "16000", str(wav),
            ])
            wavs.append(wav)

        # ffmpeg concat demuxer needs a manifest file.
        list_path = td_path / "list.txt"
        lines: list[str] = []
        for i, wav in enumerate(wavs):
            lines.append(f"file '{wav}'")
            if i < len(wavs) - 1:
                lines.append(f"file '{silence}'")
        list_path.write_text("\n".join(lines))

        OUT_WAV.parent.mkdir(parents=True, exist_ok=True)
        _run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(list_path),
            "-c", "copy", str(OUT_WAV),
        ])

    dur = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(OUT_WAV)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    print(f"wrote {OUT_WAV} ({dur}s)")


if __name__ == "__main__":
    main()
