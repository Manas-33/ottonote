import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel

from app.diarization import diarize_file
from app.merge import assign_speakers
from app.summarize import MeetingNotes, TranscriptSegment, summarize_segments
from app.transcription import transcribe_file

app = FastAPI(title="OttoNote Backend", version="0.1.0")


class SegmentOut(BaseModel):
    start: float
    end: float
    text: str
    speaker: str | None = None


class TranscribeResponse(BaseModel):
    language: str
    language_probability: float
    duration: float
    segments: list[SegmentOut]
    num_speakers: int = 0


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    diarize: bool = True,
) -> TranscribeResponse:
    """Transcribe audio and optionally label segments with speakers.

    Set `diarize=false` to skip pyannote (much faster, no speaker labels).
    """
    # Stream upload to a temp file (whisper + pyannote need a decodable source).
    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)

    try:
        result = await transcribe_file(tmp_path)
        if diarize:
            turns = await diarize_file(tmp_path)
            speaker_segments = assign_speakers(result.segments, turns)
            num_speakers = len({t.speaker for t in turns})
            segments_out = [
                SegmentOut(start=s.start, end=s.end, text=s.text, speaker=s.speaker)
                for s in speaker_segments
            ]
        else:
            num_speakers = 0
            segments_out = [
                SegmentOut(start=s.start, end=s.end, text=s.text) for s in result.segments
            ]
    finally:
        tmp_path.unlink(missing_ok=True)

    return TranscribeResponse(
        language=result.language,
        language_probability=result.language_probability,
        duration=result.duration,
        segments=segments_out,
        num_speakers=num_speakers,
    )


class SummarizeRequest(BaseModel):
    segments: list[TranscriptSegment]


@app.post("/summarize", response_model=MeetingNotes)
async def summarize(req: SummarizeRequest) -> MeetingNotes:
    """Extract structured meeting notes from a speaker-labeled transcript."""
    return await summarize_segments(req.segments)


@app.post("/process", response_model=MeetingNotes)
async def process(file: UploadFile = File(...)) -> MeetingNotes:
    """Full pipeline: upload audio → transcribe + diarize → summarize."""
    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)

    try:
        result = await transcribe_file(tmp_path)
        turns = await diarize_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    speaker_segments = assign_speakers(result.segments, turns)
    transcript_segments = [
        TranscriptSegment(start=s.start, end=s.end, text=s.text, speaker=s.speaker)
        for s in speaker_segments
    ]
    return await summarize_segments(transcript_segments)
