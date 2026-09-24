# OttoNote backend

The API and background worker behind OttoNote. It takes meeting audio, transcribes it with faster-whisper, separates speakers with pyannote.audio, and uses Claude to write notes where every item cites the transcript. For what OttoNote is and how the pieces fit together, see the [main README](../README.md).

## Setup

```bash
cd backend
cp .env.example .env     # fill in HF_TOKEN, ANTHROPIC_API_KEY and the SUPABASE_* values
uv sync
uv run alembic upgrade head

# Create the private storage bucket for audio. Safe to run again.
uv run python scripts/setup_storage.py
```

Every setting is explained in [`.env.example`](.env.example).

## Run

Three processes: Redis, the API and the Celery worker.

```bash
# 1. Redis (Celery's broker and result backend)
redis-server                       # or: docker run -p 6379:6379 redis:7

# 2. API
uv run uvicorn app.main:app --reload

# 3. Worker (runs the audio pipeline)
uv run celery -A app.celery_app worker --pool=solo --loglevel=info
```

Check that it's up:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

Interactive API docs are at http://localhost:8000/docs.

`--pool=solo` is only for macOS. pyannote and faster-whisper each load their own copy of the ffmpeg libraries, and the two copies crash when Celery forks a worker. On Linux, see [Deploying on Linux](#deploying-on-linux).

## How a meeting is processed

1. `POST /meetings` creates an empty meeting.
2. `POST /meetings/{id}/process` takes the audio as a `file` form field (any format), saves it to Supabase Storage and queues the job. It returns straight away with `status: "processing"`.
3. The worker goes through these steps, updating `progress_step` as it goes: `normalizing`, `transcribing`, `diarizing`, `summarizing`, `verifying`, `resolving`, `finalizing`.
4. Poll `GET /meetings/{id}` until `status` is `done`, `failed` or `cancelled`.

If a run fails or is cancelled, `POST /meetings/{id}/retry` runs it again on the same audio.

## API

Every route except `/health` needs a Supabase access token in the `Authorization: Bearer <token>` header.

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Liveness check (no auth) |
| POST | `/meetings` | Create a meeting, with an optional `title` and `workspace_id` |
| GET | `/meetings` | List your meetings, newest first. Filter with `?workspace_id=` |
| GET | `/meetings/{id}` | The full meeting: transcript, summary, decisions, action items and calendar events |
| PATCH | `/meetings/{id}` | Change the title, workspace or speaker names |
| DELETE | `/meetings/{id}` | Delete a meeting and everything in it |
| POST | `/meetings/{id}/process` | Upload audio and start processing |
| DELETE | `/meetings/{id}/process` | Cancel processing |
| POST | `/meetings/{id}/retry` | Process a failed or cancelled meeting again |
| GET | `/meetings/{id}/audio_url` | A signed link to stream the audio, valid for one hour |
| PATCH | `/meetings/{id}/action_items/{item_id}` | Mark an action item `open` or `done` |
| GET | `/workspaces` | List your workspaces |
| POST | `/workspaces` | Create a workspace, with a `name` and optional `color` |
| PATCH | `/workspaces/{id}` | Rename or recolor a workspace |
| DELETE | `/workspaces/{id}` | Delete a workspace and move its meetings to your default one. The default workspace can't be deleted |

### Dev-only routes

Setting `DEV_MODE=true` in `.env` turns on three routes that skip auth and the database, so you can try the pipeline directly. Never turn this on in production.

| Method | Path | What it does |
|---|---|---|
| POST | `/transcribe` | Transcribe an uploaded file, with speaker labels |
| POST | `/summarize` | Write notes from a list of transcript segments |
| POST | `/process` | Transcribe an uploaded file and write notes, without the fact-check step |

A quick test on macOS:

```bash
mkdir -p samples
say -o samples/test.aiff "Hello, this is a test."
curl -X POST http://localhost:8000/transcribe -F "file=@samples/test.aiff"
```

## Deploying on Linux

The fork crash only happens on macOS, so on Linux drop `--pool=solo` and use Celery's default pool. `--concurrency=N` then processes N meetings at once per worker:

```bash
celery -A app.celery_app worker --concurrency=4 --loglevel=info
```

Each child process loads its own Whisper and pyannote models, so choose N based on the worker's memory. To handle more, run extra workers on other machines, all pointed at the same Redis.

## Migrations

```bash
# Generate a new migration after editing models
uv run alembic revision --autogenerate -m "what changed"

# Apply migrations
uv run alembic upgrade head

# Roll back one migration
uv run alembic downgrade -1
```

## Evals

[`evals/`](evals/) holds a harness that measures how well the note-writing and fact-checking code avoids made-up items. Its [README](evals/README.md) explains how to run it, and [REPORT.md](evals/REPORT.md) has the results.
