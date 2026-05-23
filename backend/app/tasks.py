"""Celery tasks. Runs the meeting pipeline off the request path."""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.diarization import diarize_file
from app.merge import assign_speakers
from app.models import ActionItem, CalendarEvent, Meeting, Segment, Summary
from app.summarize import TranscriptSegment, summarize_segments
from app.transcription import transcribe_file


async def _run_pipeline(meeting_id: uuid.UUID, audio_path: Path) -> None:
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

            try:
                transcription = await transcribe_file(audio_path)
                turns = await diarize_file(audio_path)
                labeled = assign_speakers(transcription.segments, turns)
                notes = await summarize_segments(
                    [
                        TranscriptSegment(
                            start=s.start, end=s.end, text=s.text, speaker=s.speaker
                        )
                        for s in labeled
                    ]
                )
            except Exception as e:
                meeting.status = "failed"
                meeting.error_message = str(e)[:500]
                await db.commit()
                raise

            # Cancellation race: if the user cancelled while the pipeline ran,
            # the API already set status=cancelled. Don't overwrite their decision.
            await db.refresh(meeting, attribute_names=["status"])
            if meeting.status == "cancelled":
                return

            meeting.duration_sec = transcription.duration
            meeting.language = transcription.language
            meeting.num_speakers = len({t.speaker for t in turns})
            meeting.status = "done"

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

            db.add(
                Summary(
                    meeting_id=meeting.id,
                    summary=notes.summary,
                    decisions=notes.decisions,
                    keywords=notes.keywords_by_category,
                    follow_ups=notes.follow_ups,
                )
            )
            for item in notes.action_items:
                db.add(
                    ActionItem(
                        meeting_id=meeting.id,
                        assignee=item.assignee,
                        task=item.task,
                        due_date=item.due_date,
                    )
                )
            for ev in notes.calendar_events:
                db.add(
                    CalendarEvent(
                        meeting_id=meeting.id,
                        title=ev.title,
                        when_text=ev.datetime,
                        description=ev.description,
                    )
                )

            await db.commit()
    finally:
        await engine.dispose()


@celery_app.task(name="app.tasks.process_meeting")
def process_meeting_task(meeting_id: str, audio_path: str) -> None:
    path = Path(audio_path)
    try:
        asyncio.run(_run_pipeline(uuid.UUID(meeting_id), path))
    finally:
        path.unlink(missing_ok=True)
