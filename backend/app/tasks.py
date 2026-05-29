"""Celery tasks. Runs the meeting pipeline off the request path."""

from __future__ import annotations

import asyncio
import subprocess
import uuid
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.diarization import diarize_file
from app.merge import assign_speakers
from app.models import ActionItem, CalendarEvent, Meeting, Segment, Summary
from app.storage import download_audio_to_tmp
from app.summarize import (
    CONFIDENCE_THRESHOLD,
    TranscriptSegment,
    resolve_speakers,
    summarize_segments,
    verify_notes,
)
from app.transcription import transcribe_file


def _normalize_to_wav(src: Path) -> Path:
    """Re-encode any input to 16kHz mono WAV.

    MediaRecorder webm files don't include duration metadata, which breaks
    pyannote (it needs duration up-front to chunk). Whisper and pyannote both
    work best on 16kHz mono WAV anyway, so we normalize unconditionally.
    """
    dst = src.with_suffix(".norm.wav")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )
    return dst


async def _run_pipeline(meeting_id: uuid.UUID) -> None:
    # Build engine inside this task's event loop. Celery runs each task via
    # asyncio.run(), which creates a fresh loop; asyncpg connections are
    # loop-bound, so reusing app.db.engine across tasks raises "attached to a
    # different loop". Dispose at the end to release the asyncpg pool.
    engine = create_async_engine(settings.async_database_url, pool_pre_ping=True)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with SessionLocal() as db:
            meeting = (
                await db.execute(select(Meeting).where(Meeting.id == meeting_id))
            ).scalar_one()

            # Idempotency: wipe any children left over from a previous (failed/retried)
            # run so acks_late redelivery doesn't duplicate rows.
            await db.execute(delete(Segment).where(Segment.meeting_id == meeting_id))
            await db.execute(delete(Summary).where(Summary.meeting_id == meeting_id))
            await db.execute(delete(ActionItem).where(ActionItem.meeting_id == meeting_id))
            await db.execute(delete(CalendarEvent).where(CalendarEvent.meeting_id == meeting_id))

            if not meeting.audio_url:
                meeting.status = "failed"
                meeting.error_message = "No audio_url on meeting"
                await db.commit()
                return

            audio_path = await download_audio_to_tmp(meeting.audio_url)
            normalized_path: Path | None = None
            try:
                try:
                    # Stage-level progress: each commit lands a new value that
                    # API readers (Idle library, Processing screen) pick up on
                    # their next poll. Stages are coarse — within a stage we
                    # have no further granularity to expose.
                    meeting.progress_step = "normalizing"
                    await db.commit()
                    normalized_path = await asyncio.to_thread(
                        _normalize_to_wav, audio_path
                    )

                    meeting.progress_step = "transcribing"
                    await db.commit()
                    transcription = await transcribe_file(normalized_path)

                    meeting.progress_step = "diarizing"
                    await db.commit()
                    turns = await diarize_file(normalized_path)
                    labeled = assign_speakers(transcription.segments, turns)

                    meeting.progress_step = "summarizing"
                    await db.commit()
                    transcript_segments = [
                        TranscriptSegment(
                            start=s.start, end=s.end, text=s.text, speaker=s.speaker
                        )
                        for s in labeled
                    ]
                    notes = await summarize_segments(transcript_segments)

                    meeting.progress_step = "verifying"
                    await db.commit()
                    verdicts = await verify_notes(transcript_segments, notes)

                    meeting.progress_step = "resolving"
                    await db.commit()
                    inferred_names = await resolve_speakers(transcript_segments)
                except Exception as e:
                    meeting.status = "failed"
                    meeting.progress_step = None
                    meeting.error_message = str(e)[:500]
                    await db.commit()
                    raise
            finally:
                audio_path.unlink(missing_ok=True)
                if normalized_path is not None:
                    normalized_path.unlink(missing_ok=True)

            # Cancellation race: if the user cancelled while the pipeline ran,
            # the API already set status=cancelled. Don't overwrite their decision.
            await db.refresh(meeting, attribute_names=["status"])
            if meeting.status == "cancelled":
                return

            meeting.progress_step = "finalizing"
            meeting.duration_sec = transcription.duration
            meeting.language = transcription.language
            meeting.num_speakers = len({t.speaker for t in turns})
            meeting.status = "done"

            # Merge LLM-inferred names with any existing user overrides.
            # User overrides take precedence — don't clobber manual renames.
            existing = dict(meeting.speaker_names or {})
            for label, name in inferred_names.items():
                existing.setdefault(label, name)
            meeting.speaker_names = existing

            for idx, seg in enumerate(labeled):
                db.add(
                    Segment(
                        meeting_id=meeting.id,
                        idx=idx,
                        start_sec=seg.start,
                        end_sec=seg.end,
                        speaker=seg.speaker,
                        text=seg.text,
                    )
                )

            decisions_out = []
            for i, d in enumerate(notes.decisions):
                obj = d.model_dump()
                key = f"decision_{i}"
                if d.confidence < CONFIDENCE_THRESHOLD:
                    obj["verified"] = verdicts.get(key)
                decisions_out.append(obj)

            db.add(
                Summary(
                    meeting_id=meeting.id,
                    tldr=notes.tldr,
                    summary=notes.summary,
                    decisions=decisions_out,
                    keywords=notes.keywords_by_category,
                    follow_ups=notes.follow_ups,
                )
            )
            for i, item in enumerate(notes.action_items):
                key = f"action_{i}"
                verified = (
                    verdicts.get(key)
                    if item.confidence < CONFIDENCE_THRESHOLD
                    else None
                )
                db.add(
                    ActionItem(
                        meeting_id=meeting.id,
                        assignee=item.assignee,
                        task=item.task,
                        due_date=item.due_date,
                        speaker_label=item.speaker_label,
                        source_segment_indices=item.source_segment_indices,
                        confidence=item.confidence,
                        verified=verified,
                    )
                )
            for i, ev in enumerate(notes.calendar_events):
                key = f"event_{i}"
                verified = (
                    verdicts.get(key)
                    if ev.confidence < CONFIDENCE_THRESHOLD
                    else None
                )
                db.add(
                    CalendarEvent(
                        meeting_id=meeting.id,
                        title=ev.title,
                        when_text=ev.datetime,
                        description=ev.description,
                        source_segment_indices=ev.source_segment_indices,
                        confidence=ev.confidence,
                        verified=verified,
                    )
                )

            # Clear progress now that we've reached the terminal "done" state.
            meeting.progress_step = None
            await db.commit()
    finally:
        await engine.dispose()


@celery_app.task(name="app.tasks.process_meeting")
def process_meeting_task(meeting_id: str) -> None:
    asyncio.run(_run_pipeline(uuid.UUID(meeting_id)))
