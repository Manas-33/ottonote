# OttoNote Backend

FastAPI service for transcription (faster-whisper), speaker diarization (pyannote.audio), and meeting summarization (Claude).

## Setup

```bash
cd backend
cp .env.example .env  # fill in HF_TOKEN and ANTHROPIC_API_KEY
uv sync
```

## Run

```bash
uv run uvicorn app.main:app --reload
```

Then:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

## Status

- [x] Step 1: Project scaffold + `/health`
- [x] Step 2: `/transcribe` — faster-whisper on uploaded audio
- [x] Step 3: Diarization merge (pyannote `community-1`, speaker labels per segment)
- [ ] Step 4: `/summarize` — Claude structured output
- [ ] Step 5: `/process` — full pipeline end-to-end

## Quick test

```bash
# Generate a sample (macOS)
mkdir -p samples
say -o samples/test.aiff "Hello, this is a test."

# Start server
uv run uvicorn app.main:app --reload --port 8765

# In another terminal
curl -X POST http://localhost:8765/transcribe -F "file=@samples/test.aiff"
```
