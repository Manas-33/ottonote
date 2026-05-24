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
from app.celery_app import celery_app
from app.db import get_db
from app.models import ActionItem, Meeting, Workspace
from app.storage import delete_audio, signed_url, storage_path_for, upload_audio
from app.tasks import process_meeting_task
from app.workspaces import ensure_default_workspace

router = APIRouter(prefix="/meetings", tags=["meetings"])


class MeetingCreate(BaseModel):
    title: str | None = None
    workspace_id: uuid.UUID | None = None


class SegmentOut(BaseModel):
    idx: int
    start_sec: float
    end_sec: float
    speaker: str | None
    text: str


class SummaryOut(BaseModel):
    tldr: str | None
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
    progress_step: str | None
    duration_sec: float | None
    language: str | None
    num_speakers: int | None
    workspace_id: uuid.UUID | None
    created_at: str


class MeetingDetail(BaseModel):
    id: uuid.UUID
    title: str | None
    status: str
    progress_step: str | None
    duration_sec: float | None
    language: str | None
    num_speakers: int | None
    workspace_id: uuid.UUID | None
    error_message: str | None
    task_id: str | None
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
        progress_step=m.progress_step,
        duration_sec=m.duration_sec,
        language=m.language,
        num_speakers=m.num_speakers,
        workspace_id=m.workspace_id,
        error_message=m.error_message,
        task_id=m.task_id,
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
                tldr=m.summary.tldr,
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


async def _resolve_workspace_id(
    requested: uuid.UUID | None, user: CurrentUser, db: AsyncSession
) -> uuid.UUID:
    """Validate the requested workspace belongs to the user; fall back to default."""
    if requested is None:
        ws = await ensure_default_workspace(user.id, db)
        return ws.id
    stmt = select(Workspace).where(
        Workspace.id == requested, Workspace.user_id == user.id
    )
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws.id


@router.post("", response_model=MeetingDetail, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    body: MeetingCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    workspace_id = await _resolve_workspace_id(body.workspace_id, user, db)
    meeting = Meeting(
        user_id=user.id,
        title=body.title,
        status="pending",
        workspace_id=workspace_id,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    fresh = await _fetch_meeting(meeting.id, user, db)
    return _to_detail(fresh)


@router.get("", response_model=list[MeetingSummaryRow])
async def list_meetings(
    workspace_id: uuid.UUID | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MeetingSummaryRow]:
    stmt = (
        select(Meeting)
        .where(Meeting.user_id == user.id)
        .order_by(Meeting.created_at.desc())
    )
    if workspace_id is not None:
        stmt = stmt.where(Meeting.workspace_id == workspace_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        MeetingSummaryRow(
            id=m.id,
            title=m.title,
            status=m.status,
            progress_step=m.progress_step,
            duration_sec=m.duration_sec,
            language=m.language,
            num_speakers=m.num_speakers,
            workspace_id=m.workspace_id,
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
    storage_path = meeting.audio_url
    await db.delete(meeting)
    await db.commit()
    if storage_path:
        # Best-effort: a leftover object is harmless, but a broken delete
        # shouldn't fail the request after the DB row is gone.
        try:
            await delete_audio(storage_path)
        except Exception:
            pass


@router.post(
    "/{meeting_id}/process",
    response_model=MeetingDetail,
    status_code=status.HTTP_202_ACCEPTED,
)
async def process_meeting(
    meeting_id: uuid.UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Upload audio and enqueue the pipeline. Returns immediately with status=processing."""
    meeting = await _fetch_meeting(meeting_id, user, db)
    if meeting.status == "processing":
        raise HTTPException(status_code=409, detail="Meeting is already processing")

    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)

    storage_path = storage_path_for(user.id, meeting.id, suffix)
    try:
        await upload_audio(tmp_path, storage_path, file.content_type or "audio/wav")
    finally:
        tmp_path.unlink(missing_ok=True)

    meeting.status = "processing"
    meeting.error_message = None
    meeting.progress_step = None
    meeting.audio_url = storage_path
    await db.commit()

    async_result = process_meeting_task.delay(str(meeting.id))
    meeting.task_id = async_result.id
    await db.commit()

    fresh = await _fetch_meeting(meeting.id, user, db)
    return _to_detail(fresh)


@router.post(
    "/{meeting_id}/retry",
    response_model=MeetingDetail,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_meeting(
    meeting_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Re-enqueue the pipeline for a meeting whose previous run failed or was cancelled.

    The pipeline is idempotent — `_run_pipeline` wipes children at the start —
    so retry is just status flip + re-enqueue against the same `audio_url`.
    """
    meeting = await _fetch_meeting(meeting_id, user, db)
    if meeting.status not in ("failed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Meeting cannot be retried (status={meeting.status})",
        )
    if not meeting.audio_url:
        # Upload itself failed before storage — no audio to retry against.
        # User must re-record.
        raise HTTPException(
            status_code=409,
            detail="Meeting has no audio to retry; re-record instead",
        )

    meeting.status = "processing"
    meeting.error_message = None
    meeting.progress_step = None
    await db.commit()

    async_result = process_meeting_task.delay(str(meeting.id))
    meeting.task_id = async_result.id
    await db.commit()

    fresh = await _fetch_meeting(meeting.id, user, db)
    return _to_detail(fresh)


@router.delete(
    "/{meeting_id}/process",
    response_model=MeetingDetail,
)
async def cancel_meeting_processing(
    meeting_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Cancel an in-flight pipeline. Revokes the Celery task and marks status=cancelled."""
    meeting = await _fetch_meeting(meeting_id, user, db)
    if meeting.status != "processing":
        raise HTTPException(
            status_code=409, detail=f"Meeting is not processing (status={meeting.status})"
        )

    if meeting.task_id:
        # terminate=True kills a running task on prefork pool; on --pool=solo
        # this restarts the whole worker. Queued-but-not-started tasks are
        # dropped cleanly in both cases.
        celery_app.control.revoke(meeting.task_id, terminate=True)

    meeting.status = "cancelled"
    meeting.error_message = "Cancelled by user"
    meeting.progress_step = None
    await db.commit()

    fresh = await _fetch_meeting(meeting.id, user, db)
    return _to_detail(fresh)


class MeetingPatch(BaseModel):
    title: str | None = None
    workspace_id: uuid.UUID | None = None


@router.patch("/{meeting_id}", response_model=MeetingDetail)
async def update_meeting(
    meeting_id: uuid.UUID,
    body: MeetingPatch,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Update editable fields on a meeting (title, workspace)."""
    meeting = await _fetch_meeting(meeting_id, user, db)
    if body.title is not None:
        meeting.title = body.title.strip() or None
    if body.workspace_id is not None:
        # Validate ownership of the target workspace before reassigning.
        stmt = select(Workspace).where(
            Workspace.id == body.workspace_id, Workspace.user_id == user.id
        )
        ws = (await db.execute(stmt)).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")
        meeting.workspace_id = ws.id
    await db.commit()
    fresh = await _fetch_meeting(meeting.id, user, db)
    return _to_detail(fresh)


class AudioUrlOut(BaseModel):
    url: str
    expires_in: int


@router.get("/{meeting_id}/audio_url", response_model=AudioUrlOut)
async def get_audio_url(
    meeting_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AudioUrlOut:
    """Short-lived signed URL the client can use to stream the meeting audio."""
    meeting = await _fetch_meeting(meeting_id, user, db)
    if not meeting.audio_url:
        raise HTTPException(status_code=404, detail="Meeting has no audio")
    expires_in = 3600
    url = await signed_url(meeting.audio_url, expires_in=expires_in)
    return AudioUrlOut(url=url, expires_in=expires_in)


class ActionItemPatch(BaseModel):
    status: str  # "open" | "done"


@router.patch(
    "/{meeting_id}/action_items/{item_id}",
    response_model=ActionItemOut,
)
async def update_action_item(
    meeting_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ActionItemPatch,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActionItemOut:
    """Toggle an action item's status. Currently only `open` | `done` are accepted."""
    if body.status not in ("open", "done"):
        raise HTTPException(
            status_code=422, detail="status must be 'open' or 'done'"
        )

    # Validate ownership: meeting must belong to user, item must belong to meeting.
    await _fetch_meeting(meeting_id, user, db)
    stmt = select(ActionItem).where(
        ActionItem.id == item_id, ActionItem.meeting_id == meeting_id
    )
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    item.status = body.status
    await db.commit()
    await db.refresh(item)

    return ActionItemOut(
        id=item.id,
        assignee=item.assignee,
        task=item.task,
        due_date=item.due_date,
        status=item.status,
    )
