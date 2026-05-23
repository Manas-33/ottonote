const OFFSCREEN_URL = "src/offscreen/index.html";
const STATE_KEY = "ottonote/capture";

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ottonote/start") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab");
        await ensureOffscreen();
        const streamId = await getStreamId(tab.id);
        if (!streamId) throw new Error("Failed to get stream id");
        const res = await sendToOffscreen<{ ok: boolean; error?: string }>({
          type: "offscreen/start",
          streamId,
        });
        if (!res.ok) throw new Error(res.error ?? "Offscreen start failed");
        await chrome.storage.local.set({ [STATE_KEY]: "recording" });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "ottonote/stop") {
    (async () => {
      try {
        const res = await sendToOffscreen<{ ok: boolean; error?: string }>({
          type: "offscreen/stop",
        });
        await chrome.storage.local.set({ [STATE_KEY]: "idle" });
        if (!res.ok) throw new Error(res.error ?? "Offscreen stop failed");
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  return false;
});
