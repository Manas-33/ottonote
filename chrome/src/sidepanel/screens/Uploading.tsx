import { useState } from "react";
import { cancelMeeting } from "../../api/meetings";
import { resetState, type CaptureState } from "../../state";
import { PanelMast } from "../ui";

// Real upload % isn't available — fetch() doesn't expose upload progress and
// the offscreen doc doesn't stream a number through storage. We show an
// indeterminate bar plus snapshot.lastEvent text. Real percent is Phase G.

export function Uploading({
  snapshot,
  initials,
  onSettings,
}: {
  snapshot: CaptureState;
  initials?: string;
  onSettings?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (snapshot.meetingId) {
        try {
          await cancelMeeting(snapshot.meetingId);
        } catch {
          /* server may already be done — ignore */
        }
      }
      await resetState();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950">
      <PanelMast
        initials={initials}
        onSettings={onSettings}
        left={
          <span className="ml-1 chip-sq text-flame-800 bg-flame-100 dark:text-flame-300 dark:bg-flame-900/40">
            <span className="w-1.5 h-1.5 rounded-sm bg-flame-500 animate-pulse" />
            UPLOADING
          </span>
        }
      />

      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-flame-600 dark:text-flame-400">
          ○ Step 1 of 2 — Upload
        </div>
        <h1 className="mt-2 text-[22px] leading-[1.05] tracking-[-0.02em] font-semibold">
          Sending audio…
        </h1>
        <div className="mt-1 font-mono text-[11px] tabular-nums uppercase tracking-[0.1em] text-paper-500 dark:text-paper-400 truncate">
          {snapshot.lastEvent ?? "Uploading"}
        </div>

        {/* Indeterminate bar */}
        <div className="mt-7">
          <div className="relative h-1.5 bg-paper-200 dark:bg-paper-800 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-flame-500 rounded-full animate-shimmer" />
          </div>
        </div>

        {/* Two-step ledger */}
        <div className="mt-9 border-t border-b border-paper-200 dark:border-paper-800">
          {(
            [
              ["001", "Upload audio", "active"],
              ["002", "Transcribe & summarize", "pending"],
            ] as const
          ).map(([n, label, state]) => (
            <div
              key={n}
              className="flex items-center gap-3 py-2.5 border-b last:border-0 border-paper-200/60 dark:border-paper-800/60"
            >
              <span className="font-mono text-[10px] text-paper-400 dark:text-paper-500 tabular-nums w-7">
                {n}
              </span>
              <span
                className={`text-[12.5px] flex-1 ${
                  state === "active"
                    ? "text-paper-900 dark:text-paper-50 font-medium"
                    : "text-paper-500 dark:text-paper-400"
                }`}
              >
                {label}
              </span>
              {state === "active" ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-flame-500/25 border-t-flame-500 animate-spin" />
              ) : (
                <span className="w-2 h-2 rounded-full border border-paper-300 dark:border-paper-700" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-5">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="w-full h-9 font-mono text-[11px] uppercase tracking-[0.14em] text-paper-500 hover:text-red-600 dark:text-paper-400 dark:hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {busy ? "Cancelling…" : "Cancel upload"}
        </button>
      </div>
    </div>
  );
}
