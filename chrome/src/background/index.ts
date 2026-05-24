import { getFreshAccessToken } from "../auth/session";
import { resetState, setState, STATE_KEY, type CaptureState } from "../state";

const OFFSCREEN_URL = "src/offscreen/index.html";

// Open the side panel ourselves from chrome.action.onClicked so the click
// counts as a user-invocation of the extension. Using setPanelBehavior's
// openPanelOnActionClick:true would skip the invocation event entirely, which
// means activeTab is never granted — and tabCapture refuses to capture
// non-host-permitted URLs (like youtube.com) without it.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn("sidePanel.open failed", e);
  }
});

// Reflect recording state on the toolbar icon so users know capture is
// active even when the side panel is closed.
function updateBadge(state: CaptureState | undefined) {
  const recording = state?.state === "recording";
  chrome.action.setBadgeText({ text: recording ? "REC" : "" });
  if (recording) {
    chrome.action.setBadgeBackgroundColor({ color: "#ff5310" });
    chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  }
}

chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: s }) => updateBadge(s));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STATE_KEY]) return;
  updateBadge(changes[STATE_KEY].newValue as CaptureState | undefined);
});

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

const UNCAPTURABLE_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "chrome-untrusted://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
];

async function startCapture(
  tabId: number,
  url: string | null | undefined,
  title: string | null
) {
  if (url && UNCAPTURABLE_PREFIXES.some((p) => url.startsWith(p))) {
    throw new Error(
      "Chrome doesn't allow capturing this kind of page (chrome://, new-tab, web store, etc.). Open a regular web page and try again."
    );
  }

  await resetState();
  await setState({ lastEvent: "Spawning offscreen doc…" });
  await ensureOffscreen();

  await setState({ lastEvent: "Requesting stream id…" });
  const streamId = await getStreamId(tabId);
  if (!streamId) {
    throw new Error(
      "Click the OttoNote toolbar icon on the tab you want to record, then hit Start."
    );
  }

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
        await startCapture(tab.id, tab.url, tab.title ?? null);
        sendResponse({ ok: true });
      } catch (e) {
        await setState({ state: "failed", lastEvent: `Error: ${humanError(e)}` });
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
        await startCapture(tabId, sender.tab?.url, sender.tab?.title ?? null);
        sendResponse({ ok: true });
      } catch (e) {
        await setState({ state: "failed", lastEvent: `Error: ${humanError(e)}` });
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
        await setState({ state: "failed", lastEvent: `Error: ${humanError(e)}` });
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  return false;
});

function humanError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
