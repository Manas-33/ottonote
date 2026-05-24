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
  // Palette mirrors the side panel's design tokens (paper / flame).
  // Hardcoded here because Shadow DOM can't see Tailwind.
  root.innerHTML = `
    <style>
      .card {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
        background: #141413;
        color: #fafaf7;
        padding: 12px 14px;
        border-radius: 14px;
        box-shadow:
          0 10px 32px rgba(0, 0, 0, 0.32),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 360px;
      }
      .mark {
        position: relative;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 1px solid rgba(255, 83, 16, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .mark::after {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #ff5310;
        box-shadow: 0 0 0 3px rgba(255, 83, 16, 0.22);
      }
      .text { flex: 1; min-width: 0; }
      .title {
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin: 0;
      }
      .subtitle {
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: rgba(250, 250, 247, 0.55);
        margin: 3px 0 0;
        max-width: 260px;
        word-break: break-word;
      }
      .subtitle.error {
        color: #ff9d70;
        text-transform: none;
        letter-spacing: 0;
        font-family: inherit;
        font-size: 11px;
      }
      .subtitle.hint {
        color: #ff9d70;
        text-transform: none;
        letter-spacing: 0;
        font-family: inherit;
        font-size: 11px;
      }
      button {
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        border: 0;
        transition: background-color 120ms ease, color 120ms ease;
      }
      .record {
        background: #ff5310;
        color: #fff;
        padding: 8px 14px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .record:hover { background: #f03c00; }
      .record:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .dismiss {
        background: transparent;
        color: rgba(250, 250, 247, 0.55);
        padding: 4px 8px;
        font-size: 16px;
        line-height: 1;
      }
      .dismiss:hover {
        color: #fafaf7;
        background: rgba(250, 250, 247, 0.08);
      }
    </style>
    <div class="card">
      <div class="mark" aria-hidden="true"></div>
      <div class="text">
        <p class="title">OttoNote</p>
        <p class="subtitle">Record this meeting?</p>
      </div>
      <button class="record">Open</button>
      <button class="dismiss" title="Dismiss">×</button>
    </div>
  `;

  const recordBtn = root.querySelector<HTMLButtonElement>(".record")!;
  const dismissBtn = root.querySelector<HTMLButtonElement>(".dismiss")!;
  const subtitle = root.querySelector<HTMLParagraphElement>(".subtitle")!;

  // Chrome only grants activeTab when the user invokes the extension action
  // directly (toolbar / context menu / shortcut). A click in this toast does
  // not qualify, so we can't initiate capture from here. Instead, open the
  // side panel and nudge the user to click the toolbar icon — that grants
  // activeTab, and the side panel's Start button then works.
  recordBtn.addEventListener("click", async () => {
    recordBtn.textContent = "Opening…";
    recordBtn.disabled = true;
    const res = await chrome.runtime.sendMessage({
      type: "ottonote/open-side-panel-from-toast",
    });
    if (!res?.ok) {
      const err = String(res?.error ?? "Unknown error");
      console.error("OttoNote open side panel failed:", err);
      recordBtn.textContent = "Retry";
      recordBtn.disabled = false;
      subtitle.textContent = err.length > 90 ? err.slice(0, 87) + "…" : err;
      subtitle.classList.add("error");
      return;
    }
    // Side panel is open. Tell the user the second step.
    subtitle.textContent = "Click the OttoNote icon ↗ to enable recording";
    subtitle.classList.add("hint");
    recordBtn.style.display = "none";
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
