import { useState } from "react";
import { cancelMeeting, type ProgressStep } from "../../api/meetings";
import { resetState, type CaptureState } from "../../state";
import { Icon, PanelMast } from "../ui";

// The ledger reflects backend `progress_step` (mirrors app/tasks._run_pipeline).
// Stage → active-index mapping:
//   normalizing/transcribing → 1, diarizing → 2, summarizing/finalizing → 3.
// Index 0 ("Audio uploaded") is always done when this screen renders.
const STEP_ACTIVE_INDEX: Record<ProgressStep, number> = {
  normalizing: 1,
  transcribing: 1,
  diarizing: 2,
  summarizing: 3,
  finalizing: 3,
};

export function Processing({
  snapshot,
  initials,
  onSettings,
  progressStep,
}: {
  snapshot: CaptureState;
  initials?: string;
  onSettings?: () => void;
  progressStep?: ProgressStep | null;
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

  // Default to step 1 (transcribing) when no backend step has arrived yet —
  // the row pipeline always passes through transcription first.
  const activeIdx = progressStep ? STEP_ACTIVE_INDEX[progressStep] : 1;
  const labels = [
    "Audio uploaded",
    "Transcribing audio",
    "Diarizing speakers",
    "Summarizing",
  ];
  const steps: { label: string; state: "done" | "active" | "pending" }[] =
    labels.map((label, i) => ({
      label,
      state: i < activeIdx ? "done" : i === activeIdx ? "active" : "pending",
    }));

  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950">
      <PanelMast
        initials={initials}
        onSettings={onSettings}
        left={
          <span className="ml-1 chip-sq text-flame-800 bg-flame-100 dark:text-flame-300 dark:bg-flame-900/40">
            <span className="w-1.5 h-1.5 rounded-sm bg-flame-500 animate-pulse" />
            PROCESSING
          </span>
        }
      />

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-flame-600 dark:text-flame-400">
          ○ Step 2 of 2 — Processing
        </div>

        <h2 className="mt-3 text-[22px] leading-[1.05] tracking-[-0.02em] font-semibold">
          Transcribing &<br />
          summarizing…
        </h2>
        <div className="mt-2 font-mono text-[11px] tabular-nums uppercase tracking-[0.1em] text-paper-500 dark:text-paper-400 truncate max-w-full">
          {snapshot.lastEvent ?? "Working"}
        </div>

        <div className="flex items-center gap-2 mt-7 h-5">
          <span className="w-2 h-2 rounded-sm bg-flame-500 animate-dot-blink" />
          <span
            className="w-2 h-2 rounded-sm bg-flame-500 animate-dot-blink"
            style={{ animationDelay: "0.18s" }}
          />
          <span
            className="w-2 h-2 rounded-sm bg-flame-500 animate-dot-blink"
            style={{ animationDelay: "0.36s" }}
          />
        </div>

        <ul className="mt-7 w-full max-w-[260px] text-left border-t border-b border-paper-200 dark:border-paper-800">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className="flex items-center gap-2.5 py-2 border-b last:border-0 border-paper-200/60 dark:border-paper-800/60"
            >
              <span className="font-mono text-[10px] text-paper-400 dark:text-paper-500 tabular-nums w-5">
                {String(i + 1).padStart(2, "0")}
              </span>
              {step.state === "done" ? (
                <Icon
                  name="check"
                  size={13}
                  strokeWidth={2.5}
                  className="text-emerald-600 dark:text-emerald-400"
                />
              ) : step.state === "active" ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-flame-500/25 border-t-flame-500 animate-spin" />
              ) : (
                <span className="w-3 h-3 rounded-full border border-paper-300 dark:border-paper-700" />
              )}
              <span
                className={`text-[12.5px] flex-1 ${
                  step.state === "done"
                    ? "text-paper-400 dark:text-paper-500 line-through"
                    : step.state === "active"
                    ? "text-paper-900 dark:text-paper-50 font-medium"
                    : "text-paper-500 dark:text-paper-400"
                }`}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-paper-400 dark:text-paper-500">
          ETA ~30–60s typically
        </div>
      </div>

      <div className="px-4 pb-5 flex flex-col items-center">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper-500 hover:text-red-600 dark:text-paper-400 dark:hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {busy ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
