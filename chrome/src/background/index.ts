import { getFreshAccessToken } from "../auth/session";
import { resetState, setState, type CaptureState } from "../state";

const OFFSCREEN_URL = "src/offscreen/index.html";

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture meeting tab audio via tabCapture.",
  });
}

async function getStreamId(tabId: number): Promise<string> {
  return new Promise((resolve) =>
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, resolve)
  );
}

async function sendToOffscreen<T = unknown>(message: object): Promise<T> {
  return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
}

async function startCapture(tabId: number, title: string | null) {
  await resetState();
  await setState({ lastEvent: "Spawning offscreen doc…" });
  await ensureOffscreen();

  await setState({ lastEvent: "Requesting stream id…" });
  const streamId = await getStreamId(tabId);
  if (!streamId) throw new Error("Failed to get stream id");

  await setState({ lastEvent: "Starting MediaRecorder…" });
  const res = await sendToOffscreen<{ ok: boolean; error?: string }>({
    type: "offscreen/start",
    streamId,
    title,
  });
  if (!res.ok) throw new Error(res.error ?? "Offscreen start failed");

  await setState({
    state: "recording",
    startedAt: Date.now(),
    lastEvent: "Recording",
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ottonote/state-patch") {
    setState(msg.patch as Partial<CaptureState>).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (msg?.type === "ottonote/get-token") {
    getFreshAccessToken()
      .then((token) => sendResponse({ token }))
      .catch((err) => sendResponse({ token: null, error: String(err) }));
    return true;
  }

  if (msg?.type === "ottonote/start") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab");
        await startCapture(tab.id, tab.title ?? null);
        sendResponse({ ok: true });
      } catch (e) {
        await setState({ state: "failed", lastEvent: `Error: ${String(e)}` });
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "ottonote/start-from-content") {
    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) throw new Error("Missing sender tab");
        await startCapture(tabId, sender.tab?.title ?? null);
        sendResponse({ ok: true });
      } catch (e) {
        await setState({ state: "failed", lastEvent: `Error: ${String(e)}` });
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "ottonote/stop") {
    (async () => {
      try {
        await setState({ lastEvent: "Stopping recorder…" });
        const res = await sendToOffscreen<{ ok: boolean; error?: string }>({
          type: "offscreen/stop",
        });
        if (!res.ok) throw new Error(res.error ?? "Offscreen stop failed");
        sendResponse({ ok: true });
      } catch (e) {
        await setState({ state: "failed", lastEvent: `Error: ${String(e)}` });
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  return false;
});
