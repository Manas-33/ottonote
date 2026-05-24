import { useEffect, useRef, useState } from "react";
import type { CaptureState } from "../../state";
import { Button, Icon, PanelMast } from "../ui";

// Must match offscreen.ts WAVE_BARS.
const WAVE_BARS = 32;

// Title input is local-only for now — backend creates the meeting with the
// tab title at start; the user can rename in MeetingDetail after processing.
// Wiring it through to update_meeting is Phase G.

export function Recording({
  snapshot,
  initials,
  onSettings,
}: {
  snapshot: CaptureState;
  initials?: string;
  onSettings?: () => void;
}) {
  const [seconds, setSeconds] = useState(() =>
    snapshot.startedAt
      ? Math.floor((Date.now() - snapshot.startedAt) / 1000)
      : 0
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!snapshot.startedAt) return;
    const tick = () =>
      setSeconds(Math.floor((Date.now() - snapshot.startedAt!) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [snapshot.startedAt]);

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await chrome.runtime.sendMessage({ type: "ottonote/stop" });
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950">
      <PanelMast
        initials={initials}
        onSettings={onSettings}
        left={
          <span className="ml-1 chip-sq text-red-800 bg-red-100 dark:text-red-300 dark:bg-red-900/40">
            <span className="relative w-1.5 h-1.5 rounded-sm bg-red-500">
              <span className="absolute inset-0 rounded-sm bg-red-500 animate-rec-pulse" />
            </span>
            REC
          </span>
        }
      />

      {/* Timer */}
      <div className="px-5 pt-7">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-500 dark:text-paper-400 mb-3 flex items-center justify-between">
          <span>● Live · capturing tab audio</span>
          <span>48 kHz · mono</span>
        </div>
        <div className="font-mono tabular-nums text-[68px] leading-[0.9] font-medium tracking-[-0.02em] text-paper-900 dark:text-paper-50">
          {mm}
          <span className="text-paper-300 dark:text-paper-700">:</span>
          {ss}
        </div>
        <div className="mt-2 font-mono text-[10.5px] text-paper-500 dark:text-paper-400 tabular-nums uppercase tracking-[0.12em]">
          {snapshot.startedAt
            ? `Started ${formatClock(snapshot.startedAt)} · auto-saving locally`
            : "Auto-saving locally"}
        </div>
      </div>

      {/* Live waveform */}
      <div className="mt-7 px-5">
        <div className="sec-rule text-paper-500 dark:text-paper-400 mb-2.5">
          <span className="text-paper-400 dark:text-paper-500">003</span>
          <span className="text-paper-700 dark:text-paper-200">Input</span>
          <span className="line" />
        </div>
        <LiveWaveform />
      </div>

      {/* Title */}
      <div className="px-5 mt-6">
        <div className="sec-rule text-paper-500 dark:text-paper-400 mb-2.5">
          <span className="text-paper-400 dark:text-paper-500">004</span>
          <span className="text-paper-700 dark:text-paper-200">Title</span>
          <span className="line" />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled meeting"
          className="w-full h-10 px-3 rounded-lg bg-transparent border border-paper-200 dark:border-paper-800 text-[14px] focus:border-flame-500 focus:ring-2 focus:ring-flame-500/15 outline-none transition placeholder:text-paper-400 dark:placeholder:text-paper-600"
        />
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper-500 dark:text-paper-400">
          <Icon name="info" size={10} />
          You can rename after the meeting finishes processing.
        </div>
      </div>

      {/* Stop */}
      <div className="mt-auto px-4 pb-4 pt-3 border-t border-paper-200 dark:border-paper-800 bg-paper-100/60 dark:bg-paper-900/40">
        <Button
          variant="danger"
          size="lg"
          className="w-full"
          onClick={stop}
          disabled={busy}
        >
          <Icon name="square" size={13} strokeWidth={2.5} />
          {busy ? "Stopping…" : "Stop recording"}
        </Button>
      </div>
    </div>
  );
}

// Renders live audio levels broadcast by offscreen.ts. Each frame is a
// Uint8Array(1) carrying the instantaneous peak amplitude (0-255). We keep
// a rolling buffer of the last WAVE_BARS samples — oldest on the left,
// newest on the right — so the visual reads like a scope scrolling left.
// React state is bypassed: bar heights are written directly into refs to
// avoid re-rendering 30 times a second.
function LiveWaveform() {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const buffer = useRef<Uint8Array>(new Uint8Array(WAVE_BARS));

  useEffect(() => {
    const channel = new BroadcastChannel("ottonote-levels");
    let raf = 0;
    const paint = () => {
      const buf = buffer.current;
      for (let i = 0; i < WAVE_BARS; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        // Power curve (sqrt) boosts quiet speech into a visible range, plus
        // a small floor so silence stays a baseline line of dots.
        const norm = buf[i] / 255;
        const shaped = Math.sqrt(norm);
        const h = 3 + shaped * 53;
        el.style.height = `${h}px`;
      }
    };
    const handler = (ev: MessageEvent) => {
      if (!(ev.data instanceof Uint8Array) || ev.data.length !== 1) return;
      const buf = buffer.current;
      // Shift left (drop oldest), push newest on the right.
      buf.copyWithin(0, 1);
      buf[WAVE_BARS - 1] = ev.data[0];
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    };
    channel.addEventListener("message", handler);
    return () => {
      cancelAnimationFrame(raf);
      channel.removeEventListener("message", handler);
      channel.close();
    };
  }, []);

  return (
    <div className="h-16 flex items-end gap-[3px]">
      {Array.from({ length: WAVE_BARS }, (_, i) => {
        // The rightmost ~5 bars are "now" — flame-tinted so the leading edge
        // of the scrolling buffer reads as the current moment.
        const recent = i > WAVE_BARS - 5;
        return (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className={`flex-1 min-w-[3px] rounded-[1px] transition-[height] duration-75 ease-out ${
              recent ? "bg-flame-500" : "bg-paper-300 dark:bg-paper-700"
            }`}
            style={{ height: "3px" }}
          />
        );
      })}
    </div>
  );
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
