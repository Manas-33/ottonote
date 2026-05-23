// Floating toast that offers to record the current Meet/Zoom/Teams tab.
// Shadow-DOM so host-page CSS can't break it.

const STATE_KEY = "ottonote/capture";
const DISMISS_KEY = "ottonote/toast-dismissed";

type CaptureState = { state: string; meetingId?: string };

function injectToast() {
  if (document.getElementById("ottonote-toast-host")) return;

  const host = document.createElement("div");
  host.id = "ottonote-toast-host";
  host.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
  `;
  document.documentElement.appendChild(host);

  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .card {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #111;
        color: #fff;
        padding: 14px 16px;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 360px;
      }
      .title {
        font-size: 13px;
        font-weight: 600;
        margin: 0 0 2px;
      }
      .subtitle {
        font-size: 11px;
        color: #aaa;
        margin: 0;
      }
      .text { flex: 1; }
      button {
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        border: 0;
      }
      .record {
        background: #fff;
        color: #111;
        padding: 8px 12px;
      }
      .record:hover { background: #eee; }
      .dismiss {
        background: transparent;
        color: #aaa;
        padding: 4px 8px;
        font-size: 16px;
        line-height: 1;
      }
      .dismiss:hover { color: #fff; }
    </style>
    <div class="card">
      <div class="text">
        <p class="title">OttoNote</p>
        <p class="subtitle">Record this meeting?</p>
      </div>
      <button class="record">Record</button>
      <button class="dismiss" title="Dismiss">×</button>
    </div>
  `;

  const recordBtn = root.querySelector<HTMLButtonElement>(".record")!;
  const dismissBtn = root.querySelector<HTMLButtonElement>(".dismiss")!;

  recordBtn.addEventListener("click", async () => {
    recordBtn.textContent = "Starting…";
    recordBtn.disabled = true;
    const res = await chrome.runtime.sendMessage({
      type: "ottonote/start-from-content",
    });
    if (!res?.ok) {
      recordBtn.textContent = "Failed — try popup";
      console.error("OttoNote start failed:", res?.error);
      return;
    }
    removeToast();
  });

  dismissBtn.addEventListener("click", () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    removeToast();
  });
}

function removeToast() {
  document.getElementById("ottonote-toast-host")?.remove();
}

async function maybeShow() {
  if (sessionStorage.getItem(DISMISS_KEY)) return;
  const { [STATE_KEY]: s } = await chrome.storage.local.get(STATE_KEY);
  const state = (s as CaptureState | undefined)?.state ?? "idle";
  // Don't pester the user while a meeting is already in flight.
  if (state === "idle" || state === "done" || state === "failed") {
    injectToast();
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (!changes[STATE_KEY]) return;
  const next = (changes[STATE_KEY].newValue as CaptureState | undefined)?.state;
  if (next === "recording" || next === "uploading" || next === "processing") {
    removeToast();
  }
});

maybeShow();
