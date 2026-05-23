# OttoNote Backend

FastAPI service for transcription (faster-whisper), speaker diarization (pyannote.audio), and meeting summarization (Claude).

## Setup

```bash
cd backend
cp .env.example .env  # fill in HF_TOKEN and ANTHROPIC_API_KEY
uv sync
```

## Run

Three processes: Redis, the API, and the Celery worker.

```bash
# 1. Redis (broker + result backend for Celery)
redis-server                       # or: docker run -p 6379:6379 redis:7

# 2. API
uv run uvicorn app.main:app --reload

# 3. Worker (runs the transcribe/diarize/summarize pipeline)
#    macOS: --pool=solo avoids a fork crash from duplicate ffmpeg/av dylibs
#    loaded by pyannote+faster-whisper. On Linux, drop --pool=solo for the
#    default prefork pool and add --concurrency=N to scale.
uv run celery -A app.celery_app worker --pool=solo --loglevel=info
```

`POST /meetings/{id}/process` enqueues the pipeline and returns immediately
with `status: "processing"`. Poll `GET /meetings/{id}` until `status` is
`done` or `failed`.

### Deployment (Linux)

`--pool=solo` is a macOS-only workaround for the ffmpeg/av dylib clash on
fork — it limits one worker process to one job at a time. On Linux the
clash doesn't happen, so use the default prefork pool with `--concurrency=N`
to process N meetings in parallel per worker process:

```bash
celery -A app.celery_app worker --concurrency=4 --loglevel=info
```

Tune `N` against worker RAM — each child loads its own Whisper + pyannote
models. Scale horizontally by running more worker containers/machines all
pointing at the same Redis broker.

Then:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

## Status

- [x] Step 1: Project scaffold + `/health`
- [x] Step 2: `/transcribe` — faster-whisper on uploaded audio
- [x] Step 3: Diarization merge (pyannote `community-1`, speaker labels per segment)
- [x] Step 4: `/summarize` — Claude structured output via tool use
- [x] Step 5: `/process` — full pipeline end-to-end (audio → notes)

## Endpoints

All `/meetings*` endpoints require a Supabase JWT in `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness check |
| POST | `/meetings` | required | Create a new meeting (returns id) |
| GET | `/meetings` | required | List current user's meetings |
| GET | `/meetings/{id}` | required | Full meeting: segments + summary + action items |
| DELETE | `/meetings/{id}` | required | Delete meeting (cascades to all children) |
| POST | `/meetings/{id}/process` | required | Upload audio, enqueue pipeline (202, status=processing) |
| DELETE | `/meetings/{id}/process` | required | Revoke in-flight pipeline (status=cancelled) |
| POST | `/transcribe` | dev only | (Set `DEV_MODE=true` in `.env`) |
| POST | `/summarize` | dev only | (Set `DEV_MODE=true` in `.env`) |
| POST | `/process` | dev only | (Set `DEV_MODE=true` in `.env`) |

OpenAPI docs at `http://localhost:8765/docs`.

## Migrations

```bash
# Generate a new migration after editing models
uv run alembic revision --autogenerate -m "what changed"

# Apply migrations to Supabase
uv run alembic upgrade head

# Roll back one migration
uv run alembic downgrade -1
```

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
