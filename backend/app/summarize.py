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
    # The diarized speaker who voiced the commitment. May differ from
    # `assignee` (e.g. "James, can you follow up?" — voiced by SPEAKER_00,
    # assigned to James). Null if the LLM cannot attribute it.
    speaker_label: str | None = Field(default=None)
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="0.0–1.0 confidence that this action item is real and accurate",
    )


class CalendarEvent(BaseModel):
    title: str
    datetime: str = Field(description="Natural-language datetime, e.g. 'next Friday at 2pm'")
    description: str | None = None
    source_segment_indices: list[int] = Field(default_factory=list)
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="0.0–1.0 confidence that this event is real and accurate",
    )


class Decision(BaseModel):
    text: str
    source_segment_indices: list[int] = Field(default_factory=list)
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="0.0–1.0 confidence that this decision was actually made",
    )


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
                        "confidence": {
                            "type": "number",
                            "description": (
                                "0.0–1.0 confidence that this decision was "
                                "actually agreed upon in the meeting. 1.0 = "
                                "explicitly stated; lower values for implied "
                                "or ambiguous decisions."
                            ),
                        },
                    },
                    "required": ["text", "source_segment_indices", "confidence"],
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
                        "speaker_label": {
                            "type": "string",
                            "description": (
                                "The diarized speaker (SPEAKER_00, SPEAKER_01, "
                                "...) who voiced the commitment — typically the "
                                "person saying 'I will' or accepting an ask. "
                                "May differ from `assignee` when one person "
                                "assigns work to another. Omit only when the "
                                "speaker truly cannot be determined."
                            ),
                        },
                        "confidence": {
                            "type": "number",
                            "description": (
                                "0.0–1.0 confidence that this action item is "
                                "a real commitment. 1.0 = explicit 'I will' / "
                                "'can you'; lower for vague or implied tasks."
                            ),
                        },
                    },
                    "required": ["assignee", "task", "source_segment_indices", "confidence"],
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
                        "confidence": {
                            "type": "number",
                            "description": (
                                "0.0–1.0 confidence that this event was "
                                "actually scheduled. 1.0 = explicit date/time "
                                "agreed; lower for tentative or vague mentions."
                            ),
                        },
                    },
                    "required": ["title", "datetime", "source_segment_indices", "confidence"],
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
    "For each action item, also set `speaker_label` to the SPEAKER_NN that voiced "
    "the commitment — usually the person who said 'I will' or accepted the ask. "
    "This may differ from `assignee` when someone assigns work to another person "
    "(e.g. 'James, can you handle X?' → assignee=James, speaker_label=whoever was "
    "speaking). Omit only when no speaker can be reasonably attributed. "
    "For every decision, action item, and calendar event, set `confidence` to a "
    "value between 0.0 and 1.0 indicating how certain you are the item is real: "
    "1.0 = explicitly stated and unambiguous; 0.7-0.9 = clearly implied but not "
    "verbatim; 0.4-0.6 = tentative, hedged, or conditional; below 0.4 = speculative "
    "or only loosely inferred. Be honest — do not inflate confidence. "
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


# ---------------------------------------------------------------------------
# Verification pass — second LLM call for low-confidence items
# ---------------------------------------------------------------------------

CONFIDENCE_THRESHOLD = 0.8

class VerificationVerdict(BaseModel):
    item_key: str = Field(description="Key from the input list, e.g. 'action_0'")
    verified: bool = Field(description="True if the transcript supports the item")


class VerificationResult(BaseModel):
    verdicts: list[VerificationVerdict] = Field(default_factory=list)


_VERIFY_TOOL = {
    "name": "record_verdicts",
    "description": "Record verification verdicts for extracted meeting items.",
    "input_schema": {
        "type": "object",
        "properties": {
            "verdicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "item_key": {
                            "type": "string",
                            "description": "The key identifying the item (e.g. 'action_0').",
                        },
                        "verified": {
                            "type": "boolean",
                            "description": (
                                "true if the transcript genuinely supports this "
                                "item; false if the item appears hallucinated, "
                                "overstated, or not grounded in the transcript."
                            ),
                        },
                    },
                    "required": ["item_key", "verified"],
                },
            },
        },
        "required": ["verdicts"],
    },
}

_VERIFY_SYSTEM_PROMPT = (
    "You are a fact-checker for meeting notes. You will receive a transcript "
    "and a list of items that were extracted from it. Each item has a key, a "
    "description, and the transcript segment indices it was supposedly derived "
    "from. Your job is to check whether each item is genuinely supported by "
    "the transcript. Set verified=true only if the transcript clearly supports "
    "the item. Set verified=false if the item is hallucinated, significantly "
    "overstated, or not grounded in what was actually said. "
    "Always respond by calling the record_verdicts tool."
)


def _build_verification_prompt(
    transcript: str,
    notes: MeetingNotes,
) -> tuple[str, list[str]]:
    """Build the user message for the verification call.

    Returns (prompt_text, list_of_item_keys) so the caller can map verdicts
    back to items. Only includes items below CONFIDENCE_THRESHOLD.
    """
    lines: list[str] = []
    keys: list[str] = []

    for i, item in enumerate(notes.action_items):
        if item.confidence < CONFIDENCE_THRESHOLD:
            key = f"action_{i}"
            keys.append(key)
            segs = ", ".join(f"#{idx}" for idx in item.source_segment_indices)
            lines.append(
                f"- [{key}] ACTION ITEM: \"{item.task}\" "
                f"(assignee: {item.assignee}, segments: [{segs}])"
            )

    for i, d in enumerate(notes.decisions):
        if d.confidence < CONFIDENCE_THRESHOLD:
            key = f"decision_{i}"
            keys.append(key)
            segs = ", ".join(f"#{idx}" for idx in d.source_segment_indices)
            lines.append(
                f"- [{key}] DECISION: \"{d.text}\" (segments: [{segs}])"
            )

    for i, ev in enumerate(notes.calendar_events):
        if ev.confidence < CONFIDENCE_THRESHOLD:
            key = f"event_{i}"
            keys.append(key)
            segs = ", ".join(f"#{idx}" for idx in ev.source_segment_indices)
            lines.append(
                f"- [{key}] CALENDAR EVENT: \"{ev.title}\" "
                f"on \"{ev.datetime}\" (segments: [{segs}])"
            )

    items_block = "\n".join(lines)
    prompt = (
        f"Transcript:\n\n{transcript}\n\n"
        f"Items to verify:\n\n{items_block}"
    )
    return prompt, keys


def _verify_sync(
    segments: list[TranscriptSegment],
    notes: MeetingNotes,
) -> dict[str, bool]:
    """Run verification and return {item_key: verified} for checked items."""
    transcript = _format_transcript(segments)
    prompt, keys = _build_verification_prompt(transcript, notes)

    if not keys:
        return {}

    client = Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=_VERIFY_SYSTEM_PROMPT,
        tools=[_VERIFY_TOOL],
        tool_choice={"type": "tool", "name": "record_verdicts"},
        messages=[{"role": "user", "content": prompt}],
    )

    for block in message.content:
        if block.type == "tool_use" and block.name == "record_verdicts":
            result = VerificationResult.model_validate(block.input)
            return {v.item_key: v.verified for v in result.verdicts}

    return {}


async def verify_notes(
    segments: list[TranscriptSegment],
    notes: MeetingNotes,
) -> dict[str, bool]:
    """Verify low-confidence items against the transcript.

    Returns a dict mapping item keys (e.g. "action_0", "decision_1") to
    their verification verdict. Items above CONFIDENCE_THRESHOLD are not
    included — they're trusted without a second check.
    """
    return await asyncio.to_thread(_verify_sync, segments, notes)
