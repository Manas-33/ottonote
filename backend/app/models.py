"""SQLAlchemy ORM models. Schema lives in our app's `ottonote` namespace.

We reference Supabase's auth.users(id) for the user_id column, but we don't
import it as an ORM model — it's owned by Supabase Auth, not us.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # One of the preset palette keys defined by the client (slate, blue,
    # emerald, amber, rose, violet). Stored as a free-form string so the
    # palette can grow without a migration.
    color: Mapped[str] = mapped_column(String(20), default="slate", nullable=False)
    # The user's auto-created "Default" workspace. Exactly one per user.
    # Cannot be deleted; receives orphaned meetings when other workspaces
    # are deleted.
    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    meetings: Mapped[list["Meeting"]] = relationship(back_populates="workspace")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    title: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    # pending | processing | done | failed | cancelled
    duration_sec: Mapped[float | None] = mapped_column(Float)
    language: Mapped[str | None] = mapped_column(String(10))
    num_speakers: Mapped[int | None] = mapped_column(Integer)
    audio_url: Mapped[str | None] = mapped_column(Text)  # filled in only if we store audio
    error_message: Mapped[str | None] = mapped_column(Text)
    task_id: Mapped[str | None] = mapped_column(String(64))  # Celery AsyncResult id
    # Current pipeline stage while status=processing. One of: normalizing,
    # transcribing, diarizing, summarizing, finalizing. Null otherwise.
    progress_step: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    workspace: Mapped["Workspace | None"] = relationship(back_populates="meetings")

    segments: Mapped[list["Segment"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="Segment.idx"
    )
    summary: Mapped["Summary | None"] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", uselist=False
    )
    action_items: Mapped[list["ActionItem"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    calendar_events: Mapped[list["CalendarEvent"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    speaker: Mapped[str | None] = mapped_column(String(50))
    text: Mapped[str] = mapped_column(Text, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")


class Summary(Base):
    __tablename__ = "summaries"

    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # One-sentence headline with inline <mark>...</mark> tags. Nullable so
    # pre-tldr meetings keep working — the frontend just hides the pull-quote.
    tldr: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    decisions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    keywords: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    follow_ups: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    meeting: Mapped[Meeting] = relationship(back_populates="summary")


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    assignee: Mapped[str] = mapped_column(String(100), nullable=False)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[str | None] = mapped_column(String(100))  # free text for now
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    # open | done
    # The diarized speaker who voiced the commitment (e.g. "SPEAKER_01").
    # Separate from `assignee` — see note in summarize.ActionItem.
    speaker_label: Mapped[str | None] = mapped_column(String(50))
    # Segment.idx values that support this item — used by the "show source"
    # affordance in the UI. Empty if the LLM couldn't cite a passage.
    source_segment_indices: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    meeting: Mapped[Meeting] = relationship(back_populates="action_items")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    when_text: Mapped[str] = mapped_column(String(200), nullable=False)  # natural language
    description: Mapped[str | None] = mapped_column(Text)
    # Segment.idx values that support this event — see ActionItem.
    source_segment_indices: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )

    meeting: Mapped[Meeting] = relationship(back_populates="calendar_events")
