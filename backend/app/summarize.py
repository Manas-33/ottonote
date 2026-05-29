"""Claude-powered meeting summarization via tool use (structured output)."""

from __future__ import annotations

import asyncio
import json

from anthropic import Anthropic
from pydantic import BaseModel, Field

from app.config import settings

# Keyword categories from PROJECT.md
KEYWORD_CATEGORIES = [
    "Time & Scheduling",
    "Budget & Finance",
    "Project & Execution",
    "People & Roles",
    "Decisions & Actions",
    "Risks & Issues",
    "Performance & Metrics",
]


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: str | None = None


# Source-segment anchors let the UI jump from an extracted item back to the
# transcript passages that support it. The LLM is asked to cite segments by
# their integer `idx`, which is stable (segments are inserted with a known
# index per meeting). Empty list = LLM could not (or did not) cite — UI hides
# the "show source" affordance in that case.
class ActionItem(BaseModel):
    assignee: str = Field(description="Who is responsible, or 'Unknown' if unclear")
    task: str
    due_date: str | None = Field(default=None, description="ISO date or natural-language phrase")
    source_segment_indices: list[int] = Field(default_factory=list)


class CalendarEvent(BaseModel):
    title: str
    datetime: str = Field(description="Natural-language datetime, e.g. 'next Friday at 2pm'")
    description: str | None = None
    source_segment_indices: list[int] = Field(default_factory=list)


class Decision(BaseModel):
    text: str
    source_segment_indices: list[int] = Field(default_factory=list)


class MeetingNotes(BaseModel):
    tldr: str = Field(
        description=(
            "Single-sentence headline of the meeting. Wrap the most important "
            "phrases (people, decisions, deliverables, dates, metrics) in "
            "<mark>...</mark> tags. No other HTML."
        )
    )
    summary: str = Field(description="2-4 sentences covering the main discussion")
    decisions: list[Decision] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    keywords_by_category: dict[str, list[str]] = Field(default_factory=dict)
    calendar_events: list[CalendarEvent] = Field(default_factory=list)
    follow_ups: list[str] = Field(
        default_factory=list, description="Open questions or items pending follow-up"
    )


# Tool schema for Claude — mirrors MeetingNotes
_RECORD_NOTES_TOOL = {
    "name": "record_meeting_notes",
    "description": "Record structured notes extracted from a meeting transcript.",
    "input_schema": {
        "type": "object",
        "properties": {
            "tldr": {
                "type": "string",
                "description": (
                    "One-sentence headline of the meeting. Wrap the most "
                    "important phrases — people, decisions, deliverables, "
                    "dates, metrics — in <mark>...</mark> tags. Use only "
                    "<mark> and </mark>; no other HTML or attributes. "
                    "Mark 2-5 phrases total; do not mark every word."
                ),
            },
            "summary": {
                "type": "string",
                "description": "2-4 sentence overview of the meeting.",
            },
            "decisions": {
                "type": "array",
                "description": "Clear decisions reached during the meeting.",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "source_segment_indices": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": (
                                "Indices of transcript segments (the [#N] "
                                "markers in the transcript) that support this "
                                "decision. Cite 1-3 segments. Empty only if no "
                                "specific passage supports it."
                            ),
                        },
                    },
                    "required": ["text", "source_segment_indices"],
                },
            },
            "action_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "assignee": {"type": "string"},
                        "task": {"type": "string"},
                        "due_date": {"type": "string"},
                        "source_segment_indices": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": (
                                "Indices of transcript segments (the [#N] "
                                "markers in the transcript) where the commitment "
                                "was made. Cite 1-3 segments. Empty only if you "
                                "cannot point to a specific passage."
                            ),
                        },
                    },
                    "required": ["assignee", "task", "source_segment_indices"],
                },
            },
            "keywords_by_category": {
                "type": "object",
                "description": (
                    "Keywords grouped by category. Only include categories with "
                    f"matches. Categories: {', '.join(KEYWORD_CATEGORIES)}."
                ),
                "additionalProperties": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "calendar_events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "datetime": {"type": "string"},
                        "description": {"type": "string"},
                        "source_segment_indices": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": (
                                "Indices of transcript segments (the [#N] "
                                "markers in the transcript) that proposed this "
                                "event. Cite 1-3 segments. Empty only if you "
                                "cannot point to a specific passage."
                            ),
                        },
                    },
                    "required": ["title", "datetime", "source_segment_indices"],
                },
            },
            "follow_ups": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "tldr",
            "summary",
            "decisions",
            "action_items",
            "keywords_by_category",
            "calendar_events",
            "follow_ups",
        ],
    },
}

_SYSTEM_PROMPT = (
    "You are an assistant that extracts structured notes from meeting transcripts. "
    "Each transcript line is prefixed with a segment index in the form [#N], "
    "followed by a timestamp and speaker label (SPEAKER_00, SPEAKER_01, ...). "
    "Treat each speaker as a distinct participant. When assigning action items, use "
    "the speaker label if no real name is mentioned. Be concise and factual — do not "
    "invent details not present in the transcript. "
    "For every decision, action item, and calendar event, cite the supporting "
    "segment indices via `source_segment_indices`. Prefer 1-3 indices that most "
    "directly support the item. Use the integer N from the [#N] marker. "
    "Always respond by calling the record_meeting_notes tool."
)


def _format_transcript(segments: list[TranscriptSegment]) -> str:
    """Render segments as a readable transcript for the LLM.

    The `[#N]` prefix is the segment index the LLM cites back via
    `source_segment_indices`. N matches the `idx` we'll later persist in the
    `segments` table — they're assigned 1:1 from `enumerate(segments)`.
    """
    lines = []
    for idx, seg in enumerate(segments):
        mm, ss = divmod(int(seg.start), 60)
        speaker = seg.speaker or "UNKNOWN"
        lines.append(f"[#{idx:03d}] [{mm:02d}:{ss:02d}] {speaker}: {seg.text}")
    return "\n".join(lines)


def _summarize_sync(segments: list[TranscriptSegment]) -> MeetingNotes:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in .env")

    client = Anthropic(api_key=settings.anthropic_api_key)
    transcript = _format_transcript(segments)

    message = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[_RECORD_NOTES_TOOL],
        tool_choice={"type": "tool", "name": "record_meeting_notes"},
        messages=[
            {
                "role": "user",
                "content": f"Transcript:\n\n{transcript}",
            }
        ],
    )

    # Extract tool_use block — guaranteed by tool_choice
    for block in message.content:
        if block.type == "tool_use" and block.name == "record_meeting_notes":
            return MeetingNotes.model_validate(block.input)

    raise RuntimeError(
        f"Claude did not call record_meeting_notes. Stop reason: {message.stop_reason}. "
        f"Content: {json.dumps([b.model_dump() for b in message.content])}"
    )


async def summarize_segments(segments: list[TranscriptSegment]) -> MeetingNotes:
    return await asyncio.to_thread(_summarize_sync, segments)
