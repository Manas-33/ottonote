import { apiFetch } from "./client";

export type MeetingStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "cancelled";

export type Segment = {
  idx: number;
  start_sec: number;
  end_sec: number;
  speaker: string | null;
  text: string;
};

export type Summary = {
  summary: string;
  decisions: string[];
  keywords: Record<string, string[]>;
  follow_ups: string[];
};

export type ActionItem = {
  id: string;
  assignee: string;
  task: string;
  due_date: string | null;
  status: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  when_text: string;
  description: string | null;
};

export type Meeting = {
  id: string;
  title: string | null;
  status: MeetingStatus;
  task_id: string | null;
  error_message: string | null;
  duration_sec: number | null;
  language: string | null;
  num_speakers: number | null;
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
  duration_sec: number | null;
  language: string | null;
  num_speakers: number | null;
  created_at: string;
};

export async function listMeetings(): Promise<MeetingSummaryRow[]> {
  const res = await apiFetch("/meetings");
  return jsonOrThrow<MeetingSummaryRow[]>(res, "List meetings");
}

export async function createMeeting(title?: string | null): Promise<Meeting> {
  const res = await apiFetch("/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title ?? null }),
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

export async function cancelMeeting(meetingId: string): Promise<Meeting> {
  const res = await apiFetch(`/meetings/${meetingId}/process`, {
    method: "DELETE",
  });
  return jsonOrThrow<Meeting>(res, "Cancel meeting");
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
