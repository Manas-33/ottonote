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

async function createMeeting(
  title: string,
  workspaceId: string | null
): Promise<Meeting> {
  const res = await apiFetch("/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, workspace_id: workspaceId }),
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
let sourceNode: MediaStreamAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let levelsChannel: BroadcastChannel | null = null;
let levelsInterval: number | null = null;
let chunks: Blob[] = [];
let meetingTitle: string | null = null;
let meetingWorkspaceId: string | null = null;

// Number of bars the side panel renders. Keep in sync with LiveWaveform.
const WAVE_BARS = 32;

function startLevels() {
  if (!audioCtx || !stream) return;
  sourceNode = audioCtx.createMediaStreamSource(stream);
  // Route the tab audio back to the user's speakers — tabCapture otherwise
  // mutes the source tab while we hold the stream.
  sourceNode.connect(audioCtx.destination);

  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 1024; // 1024 time-domain samples per pull
  sourceNode.connect(analyserNode);

  const sampleCount = analyserNode.fftSize;
  const buf = new Uint8Array(sampleCount);
  const single = new Uint8Array(1);

  levelsChannel = new BroadcastChannel("ottonote-levels");
  levelsInterval = self.setInterval(() => {
    if (!analyserNode || !levelsChannel) return;
    analyserNode.getByteTimeDomainData(buf);
    // Time-domain bytes oscillate around 128 (silence). The instant peak
    // deviation from 128 is what we want for a "loudness right now" reading.
    let peak = 0;
    for (let i = 0; i < sampleCount; i++) {
      const d = Math.abs(buf[i] - 128);
      if (d > peak) peak = d;
    }
    // Peak is 0..128. Double it to fill the 0..255 byte range so the side
    // panel's mapping stays uniform.
    single[0] = Math.min(255, peak * 2);
    levelsChannel.postMessage(single);
  }, 33); // ~30fps
}

function stopLevels() {
  if (levelsInterval != null) {
    self.clearInterval(levelsInterval);
    levelsInterval = null;
  }
  if (levelsChannel) {
    // Post a flatline before closing so any listening side panel doesn't keep
    // the last sample frozen on screen.
    try {
      levelsChannel.postMessage(new Uint8Array(WAVE_BARS));
    } catch {
      /* channel may already be closing */
    }
    levelsChannel.close();
    levelsChannel = null;
  }
  try {
    sourceNode?.disconnect();
    analyserNode?.disconnect();
  } catch {
    /* nodes may already be detached */
  }
  sourceNode = null;
  analyserNode = null;
}

async function start(
  streamId: string,
  title: string | null,
  workspaceId: string | null
) {
  meetingTitle = title;
  meetingWorkspaceId = workspaceId;
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
  startLevels();

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
      stopLevels();
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
    meetingTitle?.trim() ||
      `Browser meeting ${new Date().toLocaleString()}`,
    meetingWorkspaceId
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
    start(msg.streamId, msg.title ?? null, msg.workspaceId ?? null)
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
