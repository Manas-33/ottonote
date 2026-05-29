import { apiFetch } from "./client";

export type MeetingStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "cancelled";

// Mirrors backend tasks._run_pipeline stages. Null when status is not
// "processing" (or hasn't yet entered a named stage).
export type ProgressStep =
  | "normalizing"
  | "transcribing"
  | "diarizing"
  | "summarizing"
  | "finalizing";

export type Segment = {
  idx: number;
  start_sec: number;
  end_sec: number;
  speaker: string | null;
  text: string;
};

export type Decision = {
  text: string;
  // Segment.idx values that support this decision. Empty if the LLM did not
  // cite a specific passage — UI hides the "show source" affordance.
  source_segment_indices: number[];
};

export type Summary = {
  // One-sentence headline with inline <mark>...</mark> tags. Null on
  // pre-tldr meetings; the frontend hides the pull-quote in that case.
  tldr: string | null;
  summary: string;
  decisions: Decision[];
  keywords: Record<string, string[]>;
  follow_ups: string[];
};

export type ActionItem = {
  id: string;
  assignee: string;
  task: string;
  due_date: string | null;
  status: string;
  // The diarized speaker who voiced the commitment (e.g. "SPEAKER_01").
  // Used to color-code the assignee chip with the same palette as that
  // speaker's transcript rows. Distinct from `assignee` (free-text name).
  speaker_label: string | null;
  source_segment_indices: number[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  when_text: string;
  description: string | null;
  source_segment_indices: number[];
};

export type Meeting = {
  id: string;
  title: string | null;
  status: MeetingStatus;
  progress_step: ProgressStep | null;
  task_id: string | null;
  error_message: string | null;
  duration_sec: number | null;
  language: string | null;
  num_speakers: number | null;
  workspace_id: string | null;
  created_at: string;
  segments: Segment[];
  summary: Summary | null;
  action_items: ActionItem[];
  calendar_events: CalendarEvent[];
};

async function jsonOrThrow<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export type MeetingSummaryRow = {
  id: string;
  title: string | null;
  status: MeetingStatus;
  progress_step: ProgressStep | null;
  duration_sec: number | null;
  language: string | null;
  num_speakers: number | null;
  workspace_id: string | null;
  created_at: string;
};

export async function listMeetings(
  workspaceId?: string | null
): Promise<MeetingSummaryRow[]> {
  const path = workspaceId
    ? `/meetings?workspace_id=${encodeURIComponent(workspaceId)}`
    : "/meetings";
  const res = await apiFetch(path);
  return jsonOrThrow<MeetingSummaryRow[]>(res, "List meetings");
}

export async function createMeeting(
  title?: string | null,
  workspaceId?: string | null
): Promise<Meeting> {
  const res = await apiFetch("/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title ?? null,
      workspace_id: workspaceId ?? null,
    }),
  });
  return jsonOrThrow<Meeting>(res, "Create meeting");
}

export async function processMeeting(
  meetingId: string,
  blob: Blob,
  filename = "meeting.webm"
): Promise<Meeting> {
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await apiFetch(`/meetings/${meetingId}/process`, {
    method: "POST",
    body: form,
  });
  return jsonOrThrow<Meeting>(res, "Process meeting");
}

export async function getMeeting(meetingId: string): Promise<Meeting> {
  const res = await apiFetch(`/meetings/${meetingId}`);
  return jsonOrThrow<Meeting>(res, "Get meeting");
}

export async function updateMeeting(
  meetingId: string,
  patch: { title?: string | null; workspace_id?: string | null }
): Promise<Meeting> {
  const res = await apiFetch(`/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<Meeting>(res, "Update meeting");
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  const res = await apiFetch(`/meetings/${meetingId}`, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Delete failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

export async function cancelMeeting(meetingId: string): Promise<Meeting> {
  const res = await apiFetch(`/meetings/${meetingId}/process`, {
    method: "DELETE",
  });
  return jsonOrThrow<Meeting>(res, "Cancel meeting");
}

export async function retryMeeting(meetingId: string): Promise<Meeting> {
  const res = await apiFetch(`/meetings/${meetingId}/retry`, {
    method: "POST",
  });
  return jsonOrThrow<Meeting>(res, "Retry meeting");
}

export type AudioUrl = {
  url: string;
  expires_in: number;
};

export async function getAudioUrl(meetingId: string): Promise<AudioUrl> {
  const res = await apiFetch(`/meetings/${meetingId}/audio_url`);
  return jsonOrThrow<AudioUrl>(res, "Get audio URL");
}

export async function toggleActionItem(
  meetingId: string,
  itemId: string,
  status: "open" | "done"
): Promise<ActionItem> {
  const res = await apiFetch(
    `/meetings/${meetingId}/action_items/${itemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }
  );
  return jsonOrThrow<ActionItem>(res, "Toggle action item");
}
