import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel

from app.transcription import transcribe_file

app = FastAPI(title="OttoNote Backend", version="0.1.0")


class SegmentOut(BaseModel):
    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    language: str
    language_probability: float
    duration: float
    segments: list[SegmentOut]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscribeResponse:
    # Stream upload to a temp file (whisper needs a path / decodable source).
    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)

    try:
        result = await transcribe_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    return TranscribeResponse(
        language=result.language,
        language_probability=result.language_probability,
        duration=result.duration,
        segments=[SegmentOut(start=s.start, end=s.end, text=s.text) for s in result.segments],
    )
