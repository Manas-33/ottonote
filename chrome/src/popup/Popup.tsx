import { useEffect, useState } from "react";

type CaptureState = "idle" | "starting" | "recording" | "stopping";

const STATE_KEY = "ottonote/capture";

export function Popup() {
  const [state, setState] = useState<CaptureState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: s }) => {
      if (s === "recording") setState("recording");
    });
  }, []);

  const start = async () => {
    setError(null);
    setState("starting");
    const res = await chrome.runtime.sendMessage({ type: "ottonote/start" });
    if (!res?.ok) {
      setError(res?.error ?? "Failed to start");
      setState("idle");
      return;
    }
    setState("recording");
  };

  const stop = async () => {
    setState("stopping");
    const res = await chrome.runtime.sendMessage({ type: "ottonote/stop" });
    if (!res?.ok) {
      setError(res?.error ?? "Failed to stop");
    }
    setState("idle");
  };

  const recording = state === "recording";
  const busy = state === "starting" || state === "stopping";

  return (
    <div className="popup">
      <header>
        <h1>OttoNote</h1>
      </header>
      <main>
        <button
          className="primary"
          onClick={recording ? stop : start}
          disabled={busy}
        >
          {state === "starting" && "Starting…"}
          {state === "recording" && "Stop recording"}
          {state === "stopping" && "Stopping…"}
          {state === "idle" && "Start recording"}
        </button>
        <p className="hint">
          {recording
            ? "Capturing this tab's audio. Don't close the tab."
            : "Open the meeting tab, then click start."}
        </p>
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}
