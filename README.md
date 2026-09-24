<img width="1600" height="480" alt="OttoNote" src="https://github.com/user-attachments/assets/e0f3de19-328d-4b21-9307-b1ffd0a18d96" />

<p align="center"><b>Meeting notes that show their work.</b></p>

OttoNote records your meetings and turns them into notes: a short summary, the decisions that were made, and who agreed to do what. Every note links back to the exact lines of the transcript it came from, so you can check it in one click. When the model isn't sure about something, a second pass checks it against the transcript before it's saved, and the note is marked **Verified** or **Flagged**.

It comes as a Chrome extension for calls in the browser (Google Meet, Zoom, Teams) and a phone app for meetings in a room.

## Demo

**Chrome extension**

https://github.com/user-attachments/assets/b1247a9f-562c-41a0-ad64-e24341c92e8d

**Mobile app**

https://github.com/user-attachments/assets/b66afbac-9634-47f2-b812-c520774f447c

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="media/pipeline-dark.svg">
  <img src="media/pipeline-light.svg" width="100%" alt="OttoNote pipeline. Audio from a Chrome tab, phone mic or audio file is converted by ffmpeg, then faster-whisper transcribes it and pyannote works out who spoke when. The two are matched by timestamps into a speaker-labeled transcript. Claude writes the notes, citing the lines each item came from and rating its own confidence. Items below 0.8 confidence go to a second Claude call that fact-checks them and marks them verified or flagged. A third Claude call names the speakers. Everything is saved to Postgres on Supabase.">
</picture>

When you stop recording, the audio goes to a FastAPI server and a Celery worker takes it through these steps:

1. **Clean up the audio.** ffmpeg converts whatever came in to 16 kHz mono.
2. **Transcribe.** faster-whisper, with Silero VAD skipping the silence.
3. **Split speakers.** pyannote works out who spoke when, and each transcript segment gets a speaker label.
4. **Write the notes.** Claude reads the numbered transcript and has to answer through a fixed schema: a one-line TL;DR, a summary, decisions, action items, calendar events, keywords and open questions. Every decision, action item and event has to list the transcript segments it came from and give itself a confidence score.
5. **Check the shaky ones.** Anything scored below 0.8 goes to a second Claude call whose only job is to ask: does the transcript actually support this? The answer is stored with the item.
6. **Name the speakers.** A last pass picks up names from the conversation ("Sarah, can you send that over?") so the transcript says Sarah instead of SPEAKER_01. Names you set yourself always win.

In the app, every item shows its confidence score, plus a Verified or Flagged badge if it went through the check. Its **Source** link takes you straight to the transcript lines behind it.

## Does the check actually work?

A safety check you haven't measured is just a hope, so the repo includes an eval harness in [`backend/evals`](backend/evals). It runs 16 hand-labeled meetings through the real note-writing and fact-checking code. The meetings are full of traps a careless note-taker would turn into commitments: "we might look at dark mode at some point", "if the budget clears, then...", asks with no owner, dates mentioned in passing.

Results over 3 runs (259 extracted items):

| Metric | Result |
|---|---|
| Real items found (recall) | 98.6% |
| Items shown that are real (precision) | 93.1% |
| Real items wrongly flagged | 1.3% |
| Bad items caught at the 0.8 threshold | 34.6% |

The last number is the weak spot, and the data shows why. The model rates more than half of its bad items at 0.8 or higher, so they skip the fact-check entirely. Raising the threshold to 0.9 would catch 57.7% of bad items while wrongly flagging only 2.6% of real ones. The [full report](backend/evals/REPORT.md) covers the method, the threshold sweep, and two ideas that were tested and didn't help.

To run it yourself (only needs an Anthropic API key):

```bash
cd backend
uv run python evals/run_eval.py --runs 3
uv run python evals/score.py
```

## Features

**Chrome extension**

- Records the audio of the current tab, so it works with Meet, Zoom, Teams or any call running in the browser
- Offers to start recording when you open a Meet, Zoom or Teams tab
- Upload an existing recording instead of recording live
- Live level meter while recording, a step-by-step view while processing, and cancel or retry at any point
- Workspaces to keep work, school and personal meetings apart
- Search the transcript, play audio from any line, rename speakers and tick off action items
- Export to Markdown or PDF, add dates to Google Calendar, post to Slack, or create a Notion page
- Light and dark themes

**Mobile app (iOS and Android)**

- Records the room through the phone's mic, and the audio stays on the phone until you stop
- The same notes, badges and source links as the extension, with a player that jumps to the cited moment
- Workspaces and speaker renaming
- Copy the notes as Markdown

## Tech stack

| Part | Built with |
|---|---|
| Chrome extension | TypeScript, React, Vite, Tailwind, Manifest V3 (tab capture, offscreen document, side panel) |
| Mobile app | Flutter, Riverpod, dio, record, just_audio |
| API | FastAPI, async SQLAlchemy, Alembic |
| Background jobs | Celery, Redis |
| Speech | faster-whisper, Silero VAD, pyannote.audio |
| Notes | Claude through tool use, Pydantic |
| Data and auth | Supabase (Postgres, Storage, Auth) |

## Project layout

```
backend/      FastAPI API, Celery worker, speech and notes pipeline, evals
chrome/       Chrome extension (React side panel)
mobile/       Flutter app for iOS and Android
media/        demo videos
```

## Run it locally

You'll need:

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node 18 or newer
- Redis and ffmpeg
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com/)
- A [Hugging Face token](https://huggingface.co/settings/tokens) that can download `pyannote/speaker-diarization-community-1`
- Flutter, if you want the phone app

### Backend

```bash
cd backend
cp .env.example .env     # fill in your keys
uv sync
uv run alembic upgrade head
uv run python scripts/setup_storage.py
```

Then start Redis, the API and the worker, each in its own terminal:

```bash
redis-server
uv run uvicorn app.main:app --reload
uv run celery -A app.celery_app worker --pool=solo --loglevel=info
```

`--pool=solo` is only needed on macOS. The default Whisper model is `base`, which is quick on a laptop. If you have a GPU, set `WHISPER_MODEL=large-v3-turbo` in `.env` for better transcripts. The API reference and Linux deployment notes are in [backend/README.md](backend/README.md).

### Chrome extension

```bash
cd chrome
cp .env.example .env     # Supabase URL, anon key and API URL
npm install
npm run dev
```

Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `chrome/dist`. The Google Calendar, Slack and Notion options appear once their OAuth client IDs are set in `.env`.

### Mobile app

```bash
cd mobile
tool/run_dev.sh              # runs in Chrome, reusing chrome/.env
tool/run_dev.sh "iPhone 15"  # or on an iOS simulator
```

To look through the screens with sample data and no backend:

```bash
flutter run -t lib/dev_preview.dart -d chrome
```

On a real phone, `localhost` won't reach your computer. Set `VITE_API_BASE_URL` in `chrome/.env` to your computer's local network IP before running.

## Limits

- The extension records browser tabs, so it can't hear the Zoom or Teams desktop apps. Join the call in the browser instead.
- Speaker separation works best with clear audio. Heavy crosstalk or very similar voices can get mixed up.
- Transcription and speaker separation run on the server. Long meetings are slow on a CPU, and a GPU makes a big difference.
