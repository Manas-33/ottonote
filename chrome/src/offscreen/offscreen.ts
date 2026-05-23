import { config } from "../config";
import type { Meeting } from "../api/meetings";
import type { CaptureState } from "../state";

// Offscreen docs have limited chrome.* access (chrome.storage can be missing
// on some channels). Route state writes and token lookup through background.
function setState(patch: Partial<CaptureState>): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: "ottonote/state-patch", patch });
}

async function getToken(): Promise<string> {
  const res = (await chrome.runtime.sendMessage({
    type: "ottonote/get-token",
  })) as { token: string | null; error?: string };
  if (!res?.token) throw new Error(res?.error ?? "Not signed in");
  return res.token;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
}

async function jsonOrThrow<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function createMeeting(title: string): Promise<Meeting> {
  const res = await apiFetch("/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return jsonOrThrow<Meeting>(res, "Create meeting");
}

async function processMeeting(meetingId: string, blob: Blob): Promise<Meeting> {
  const form = new FormData();
  form.append("file", blob, "meeting.webm");
  const res = await apiFetch(`/meetings/${meetingId}/process`, {
    method: "POST",
    body: form,
  });
  return jsonOrThrow<Meeting>(res, "Process meeting");
}

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let chunks: Blob[] = [];

async function start(streamId: string) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // @ts-expect-error chrome-specific constraints
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(5000);
}

function stopRecorder(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!recorder) {
      resolve(null);
      return;
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      stream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close();
      recorder = null;
      stream = null;
      audioCtx = null;
      chunks = [];
      resolve(blob);
    };
    recorder.stop();
  });
}

async function stopAndUpload() {
  const blob = await stopRecorder();
  if (!blob || blob.size === 0) {
    await setState({ state: "failed", lastEvent: "No audio captured" });
    return;
  }

  const kb = Math.round(blob.size / 1024);
  await setState({ state: "uploading", lastEvent: "Creating meeting…" });

  const meeting = await createMeeting(
    `Browser meeting ${new Date().toLocaleString()}`
  );
  await setState({
    meetingId: meeting.id,
    lastEvent: `Uploading ${kb} KB…`,
  });

  const processed = await processMeeting(meeting.id, blob);
  await setState({
    state: "processing",
    lastEvent: `Processing (task ${processed.task_id?.slice(0, 8) ?? "?"})`,
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;

  if (msg.type === "offscreen/start") {
    start(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === "offscreen/stop") {
    stopAndUpload()
      .then(() => sendResponse({ ok: true }))
      .catch(async (err) => {
        await setState({ state: "failed", lastEvent: `Error: ${String(err)}` });
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  return false;
});
