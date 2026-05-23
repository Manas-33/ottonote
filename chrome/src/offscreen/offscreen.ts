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

  // Pipe captured audio back to speakers so the user still hears the meeting.
  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(5000);
}

function stop() {
  return new Promise<Blob | null>((resolve) => {
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

async function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const filename = `ottonote-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.webm`;
  await chrome.downloads.download({ url, filename, saveAs: false });
  // Revoke after a delay so the download has time to consume the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
    stop()
      .then(async (blob) => {
        if (blob && blob.size > 0) await downloadBlob(blob);
        sendResponse({ ok: true, size: blob?.size ?? 0 });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
