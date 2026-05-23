"""Meeting endpoints: create, list, fetch, delete, process audio."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.diarization import diarize_file
from app.merge import assign_speakers
from app.models import ActionItem, CalendarEvent, Meeting, Segment, Summary
from app.summarize import TranscriptSegment, summarize_segments
from app.transcription import transcribe_file

router = APIRouter(prefix="/meetings", tags=["meetings"])


class MeetingCreate(BaseModel):
    title: str | None = None


class SegmentOut(BaseModel):
    idx: int
    start_sec: float
    end_sec: float
    speaker: str | None
    text: str


class SummaryOut(BaseModel):
    summary: str
    decisions: list[str]
    keywords: dict[str, list[str]]
    follow_ups: list[str]


class ActionItemOut(BaseModel):
    id: uuid.UUID
    assignee: str
    task: str
    due_date: str | None
    status: str


class CalendarEventOut(BaseModel):
    id: uuid.UUID
    title: str
    when_text: str
    description: str | None


class MeetingSummaryRow(BaseModel):
    """Lightweight row for the list endpoint."""

    id: uuid.UUID
    title: str | None
    status: str
    duration_sec: float | None
    language: str | None
    num_speakers: int | None
    created_at: str


class MeetingDetail(BaseModel):
    id: uuid.UUID
    title: str | None
    status: str
    duration_sec: float | None
    language: str | None
    num_speakers: int | None
    error_message: str | None
    created_at: str
    segments: list[SegmentOut]
    summary: SummaryOut | None
    action_items: list[ActionItemOut]
    calendar_events: list[CalendarEventOut]


def _to_detail(m: Meeting) -> MeetingDetail:
    return MeetingDetail(
        id=m.id,
        title=m.title,
        status=m.status,
        duration_sec=m.duration_sec,
        language=m.language,
        num_speakers=m.num_speakers,
        error_message=m.error_message,
        created_at=m.created_at.isoformat(),
        segments=[
            SegmentOut(
                idx=s.idx,
                start_sec=s.start_sec,
                end_sec=s.end_sec,
                speaker=s.speaker,
                text=s.text,
            )
            for s in m.segments
        ],
        summary=(
            SummaryOut(
                summary=m.summary.summary,
                decisions=list(m.summary.decisions or []),
                keywords=dict(m.summary.keywords or {}),
                follow_ups=list(m.summary.follow_ups or []),
            )
            if m.summary
            else None
        ),
        action_items=[
            ActionItemOut(
                id=a.id,
                assignee=a.assignee,
                task=a.task,
                due_date=a.due_date,
                status=a.status,
            )
            for a in m.action_items
        ],
        calendar_events=[
            CalendarEventOut(
                id=c.id,
                title=c.title,
                when_text=c.when_text,
                description=c.description,
            )
            for c in m.calendar_events
        ],
    )


async def _fetch_meeting(
    meeting_id: uuid.UUID, user: CurrentUser, db: AsyncSession
) -> Meeting:
    stmt = (
        select(Meeting)
        .where(Meeting.id == meeting_id, Meeting.user_id == user.id)
        .options(
            selectinload(Meeting.segments),
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
            selectinload(Meeting.calendar_events),
        )
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("", response_model=MeetingDetail, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    body: MeetingCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    meeting = Meeting(user_id=user.id, title=body.title, status="pending")
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    fresh = await _fetch_meeting(meeting.id, user, db)
    return _to_detail(fresh)


@router.get("", response_model=list[MeetingSummaryRow])
async def list_meetings(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MeetingSummaryRow]:
    stmt = (
        select(Meeting)
        .where(Meeting.user_id == user.id)
        .order_by(Meeting.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        MeetingSummaryRow(
            id=m.id,
            title=m.title,
            status=m.status,
            duration_sec=m.duration_sec,
            language=m.language,
            num_speakers=m.num_speakers,
            created_at=m.created_at.isoformat(),
        )
        for m in rows
    ]


@router.get("/{meeting_id}", response_model=MeetingDetail)
async def get_meeting(
    meeting_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    meeting = await _fetch_meeting(meeting_id, user, db)
    return _to_detail(meeting)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    meeting_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    meeting = await _fetch_meeting(meeting_id, user, db)
    await db.delete(meeting)
    await db.commit()


@router.post("/{meeting_id}/process", response_model=MeetingDetail)
async def process_meeting(
    meeting_id: uuid.UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Upload audio for an existing meeting and run the full pipeline."""
    meeting = await _fetch_meeting(meeting_id, user, db)
    if meeting.status == "processing":
        raise HTTPException(status_code=409, detail="Meeting is already processing")

    meeting.status = "processing"
    meeting.error_message = None
    await db.commit()

    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)

    try:
        transcription = await transcribe_file(tmp_path)
        turns = await diarize_file(tmp_path)
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
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}") from e
    finally:
        tmp_path.unlink(missing_ok=True)

    # Persist everything
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

    meeting_id_str = meeting.id  # cache before expire_all blows away attributes
    await db.commit()
    db.expire_all()
    fresh = await _fetch_meeting(meeting_id_str, user, db)
    return _to_detail(fresh)
