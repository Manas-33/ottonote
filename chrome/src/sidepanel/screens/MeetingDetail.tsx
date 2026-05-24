import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMeeting,
  getAudioUrl,
  getMeeting,
  retryMeeting,
  toggleActionItem,
  updateMeeting,
  type ActionItem,
  type Meeting,
  type Segment,
} from "../../api/meetings";
import { downloadMarkdown } from "../../lib/exports";
import {
  formatDuration,
  formatRelative,
  formatShortDuration,
} from "../format";
import { Button, Icon, IconBtn, type IconName } from "../ui";

// Tailwind needs these class strings to appear literally in source so it can
// pick them up; keep this array spelled-out rather than generated.
const SPEAKER_PALETTE = [
  {
    avatar: "bg-flame-500",
    accent: "text-flame-600 dark:text-flame-400",
    dot: "bg-flame-500",
  },
  {
    avatar: "bg-sky-500",
    accent: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  {
    avatar: "bg-emerald-500",
    accent: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  {
    avatar: "bg-amber-500",
    accent: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    avatar: "bg-rose-500",
    accent: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  {
    avatar: "bg-violet-500",
    accent: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
] as const;

type SpeakerStyle = (typeof SPEAKER_PALETTE)[number];

export function MeetingDetail({
  meetingId,
  onBack,
  onDeleted,
}: {
  meetingId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getMeeting(meetingId)
        .then((m) => {
          if (cancelled) return;
          setMeeting(m);
          setError(null);
        })
        .catch((err) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : String(err));
        });
    };
    load();
    // Poll while server-side processing is still in flight.
    const poll =
      meeting?.status === "processing" || meeting?.status === "pending"
        ? window.setInterval(load, 3000)
        : null;
    return () => {
      cancelled = true;
      if (poll != null) window.clearInterval(poll);
    };
  }, [meetingId, meeting?.status]);

  if (error)
    return (
      <Shell onBack={onBack}>
        <p className="mt-10 text-center text-[12.5px] text-red-600 dark:text-red-400 px-6">
          {error}
        </p>
      </Shell>
    );
  if (!meeting)
    return (
      <Shell onBack={onBack}>
        <p className="mt-10 text-center text-[12.5px] text-paper-500 dark:text-paper-400">
          Loading meeting…
        </p>
      </Shell>
    );

  const updateLocal = (patch: Partial<Meeting>) =>
    setMeeting((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleTitleSave = async (newTitle: string) => {
    const trimmed = newTitle.trim();
    const previous = meeting.title;
    updateLocal({ title: trimmed || null });
    try {
      const updated = await updateMeeting(meeting.id, { title: trimmed });
      setMeeting(updated);
    } catch (err) {
      updateLocal({ title: previous });
      window.alert(
        `Couldn't save title: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleDelete = async () => {
    const label = meeting.title ?? "this meeting";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await deleteMeeting(meeting.id);
      onDeleted();
    } catch (err) {
      window.alert(
        `Delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleRetry = async () => {
    try {
      const updated = await retryMeeting(meeting.id);
      setMeeting(updated);
    } catch (err) {
      window.alert(
        `Retry failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleActionToggle = (item: ActionItem, status: "open" | "done") => {
    setMeeting((prev) =>
      prev
        ? {
            ...prev,
            action_items: prev.action_items.map((a) =>
              a.id === item.id ? { ...a, status } : a
            ),
          }
        : prev
    );
    toggleActionItem(meeting.id, item.id, status).catch((err) => {
      console.error(err);
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              action_items: prev.action_items.map((a) =>
                a.id === item.id ? { ...a, status: item.status } : a
              ),
            }
          : prev
      );
    });
  };

  return (
    <DetailLayout
      meeting={meeting}
      onBack={onBack}
      onTitleSave={handleTitleSave}
      onDelete={handleDelete}
      onActionToggle={handleActionToggle}
      onRetry={handleRetry}
    />
  );
}

function Shell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950">
      <div className="px-3 pt-2.5 pb-2 border-b border-paper-200 dark:border-paper-800 flex items-center">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-7 h-7 -ml-1 rounded-md hover:bg-paper-100 dark:hover:bg-paper-900 flex items-center justify-center text-paper-500"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400">
          ← Library
        </span>
      </div>
      <div className="flex-1 overflow-y-auto otto-scroll">{children}</div>
    </div>
  );
}

function DetailLayout({
  meeting,
  onBack,
  onTitleSave,
  onDelete,
  onActionToggle,
  onRetry,
}: {
  meeting: Meeting;
  onBack: () => void;
  onTitleSave: (s: string) => void;
  onDelete: () => void;
  onActionToggle: (item: ActionItem, status: "open" | "done") => void;
  onRetry?: () => void;
}) {
  const speakers = useMemo(
    () => deriveSpeakers(meeting.segments),
    [meeting.segments]
  );

  const failed = meeting.status === "failed" || meeting.status === "cancelled";

  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950">
      <StickyHeader
        meeting={meeting}
        speakers={speakers}
        onBack={onBack}
        onTitleSave={onTitleSave}
        onDelete={onDelete}
      />
      <div className="flex-1 overflow-y-auto otto-scroll">
        {failed ? (
          <FailedBody meeting={meeting} onRetry={onRetry} />
        ) : (
          <DoneBody
            meeting={meeting}
            speakers={speakers}
            onActionToggle={onActionToggle}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Sticky header (shared by detail + failed) ----------
function StickyHeader({
  meeting,
  speakers,
  onBack,
  onTitleSave,
  onDelete,
}: {
  meeting: Meeting;
  speakers: Map<string | null, SpeakerStyle>;
  onBack: () => void;
  onTitleSave: (s: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meeting.title ?? "");

  // Sync the editing draft with prop changes when not actively editing.
  useEffect(() => {
    if (!editing) setDraft(meeting.title ?? "");
  }, [meeting.title, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== (meeting.title ?? "")) onTitleSave(draft);
  };

  const shortId = meeting.id.slice(0, 6);
  const speakerCount = speakers.size;

  return (
    <div className="sticky top-0 z-10 bg-paper-50/95 dark:bg-paper-950/95 backdrop-blur border-b border-paper-200 dark:border-paper-800">
      <div className="flex items-center px-3 pt-2.5 pb-1.5">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-7 h-7 -ml-1 rounded-md hover:bg-paper-100 dark:hover:bg-paper-900 flex items-center justify-center text-paper-500"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400 truncate">
          ← Library / m-{shortId}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn
            name="download"
            tooltip="Download markdown"
            onClick={() => downloadMarkdown(meeting)}
          />
          <IconBtn name="share-2" tooltip="Share (coming soon)" />
          <IconBtn
            name="trash-2"
            tooltip="Delete"
            danger
            onClick={onDelete}
          />
        </div>
      </div>

      <div className="px-4 pb-3">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") {
                setDraft(meeting.title ?? "");
                setEditing(false);
              }
            }}
            placeholder="Untitled meeting"
            className="w-full bg-transparent text-[20px] font-semibold tracking-[-0.025em] leading-snug border-b border-flame-500 focus:outline-none pb-0.5"
          />
        ) : (
          <h1
            onClick={() => setEditing(true)}
            title="Click to rename"
            className="text-[20px] font-semibold tracking-[-0.025em] leading-[1.15] cursor-text hover:bg-paper-100 dark:hover:bg-paper-900 -mx-1 px-1 rounded"
          >
            {meeting.title ?? "Untitled meeting"}
          </h1>
        )}
        <div className="mt-3 flex items-center gap-3 min-w-0">
          {speakerCount > 0 && (
            <div className="flex -space-x-1.5">
              {Array.from(speakers).map(([name, style]) => (
                <div
                  key={name ?? "unknown"}
                  title={name ?? "Unknown"}
                  className={`w-6 h-6 rounded-full ring-2 ring-paper-50 dark:ring-paper-950 ${style.avatar} text-white text-[10px] font-mono font-semibold flex items-center justify-center`}
                >
                  {(name ?? "?").charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400 truncate">
            {speakerCount > 0 &&
              `${speakerCount} speaker${speakerCount === 1 ? "" : "s"} · `}
            {meeting.duration_sec != null &&
              `${formatShortDuration(meeting.duration_sec)} · `}
            {formatRelative(meeting.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Done body ----------
function DoneBody({
  meeting,
  speakers,
  onActionToggle,
}: {
  meeting: Meeting;
  speakers: Map<string | null, SpeakerStyle>;
  onActionToggle: (item: ActionItem, status: "open" | "done") => void;
}) {
  const [open, setOpen] = useState({
    summary: true,
    actions: true,
    transcript: false,
  });
  const toggle = (k: keyof typeof open) =>
    setOpen((o) => ({ ...o, [k]: !o[k] }));

  if (meeting.status === "processing" || meeting.status === "pending") {
    return (
      <p className="mt-10 text-center text-[12.5px] text-paper-500 dark:text-paper-400 px-6">
        Still processing… we’ll update this view as soon as it finishes.
      </p>
    );
  }

  const open_actions = meeting.action_items.filter((a) => a.status !== "done");
  const done_actions = meeting.action_items.filter((a) => a.status === "done");
  const total = meeting.action_items.length;
  const doneCount = done_actions.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const tldr = meeting.summary?.tldr ?? null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    if (meeting.status !== "done") return;
    let cancelled = false;
    setAudioError(null);
    getAudioUrl(meeting.id)
      .then(({ url }) => {
        if (!cancelled) setAudioUrl(url);
      })
      .catch((err) => {
        if (!cancelled)
          setAudioError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [meeting.id, meeting.status]);

  const reloadAudio = () => {
    setAudioError(null);
    getAudioUrl(meeting.id)
      .then(({ url }) => setAudioUrl(url))
      .catch((err) =>
        setAudioError(err instanceof Error ? err.message : String(err))
      );
  };

  const seekTo = (seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    el.play().catch(() => {});
  };

  return (
    <>
      <AudioBar
        url={audioUrl}
        error={audioError}
        onReload={reloadAudio}
        audioRef={audioRef}
      />

      {meeting.summary && (
        <Section
          n="01"
          title="Summary"
          icon="sparkles"
          open={open.summary}
          onToggle={() => toggle("summary")}
        >
          {tldr && (
            <div className="-mx-4 px-4 py-3 bg-flame-100/50 dark:bg-flame-900/20 border-y border-flame-200/60 dark:border-flame-900/40 mb-4">
              <div className="flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-flame-700 dark:text-flame-400 mb-1.5">
                <span>TL;DR</span>
                <span className="flex-1 h-px bg-flame-300/50 dark:bg-flame-700/50" />
              </div>
              <p className="text-[13.5px] leading-[1.5] text-paper-900 dark:text-paper-50 font-medium tracking-[-0.005em]">
                <MarkedText html={tldr} />
              </p>
            </div>
          )}

          <p className="text-[13px] leading-[1.65] text-paper-700 dark:text-paper-300">
            {meeting.summary.summary}
          </p>

          {meeting.summary.decisions.length > 0 && (
            <div className="mt-5">
              <div className="sec-rule text-paper-500 dark:text-paper-400 mb-2.5">
                <span>Decisions</span>
                <span className="line" />
                <span className="tabular-nums">
                  {meeting.summary.decisions.length}
                </span>
              </div>
              <ol className="space-y-1.5">
                {meeting.summary.decisions.map((d, i) => (
                  <li
                    key={i}
                    className="flex gap-3 p-2 -mx-2 rounded-md hover:bg-paper-100 dark:hover:bg-paper-900/60 transition-colors"
                  >
                    <span className="font-mono text-[10px] tabular-nums text-flame-600 dark:text-flame-400 pt-[3px] w-8 shrink-0 font-medium">
                      D.{String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] text-paper-800 dark:text-paper-100 leading-[1.55]">
                      {d}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {meeting.summary.follow_ups.length > 0 && (
            <div className="mt-5">
              <div className="sec-rule text-paper-500 dark:text-paper-400 mb-2.5">
                <span>Follow-ups</span>
                <span className="line" />
                <span className="tabular-nums">
                  {meeting.summary.follow_ups.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {meeting.summary.follow_ups.map((f, i) => (
                  <li
                    key={i}
                    className="text-[13px] text-paper-800 dark:text-paper-100 leading-[1.55]"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(meeting.summary.keywords).length > 0 && (
            <div className="mt-5">
              <div className="sec-rule text-paper-500 dark:text-paper-400 mb-2.5">
                <span>Keywords</span>
                <span className="line" />
                <span className="tabular-nums">
                  {Object.values(meeting.summary.keywords).reduce(
                    (n, ws) => n + ws.length,
                    0
                  )}
                </span>
              </div>
              <div className="space-y-2.5">
                {Object.entries(meeting.summary.keywords).map(
                  ([group, items]) => (
                    <div key={group} className="flex items-baseline gap-2.5">
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-paper-400 dark:text-paper-500 w-[88px] shrink-0 pt-[5px]">
                        {group.split(" ")[0]}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {items.map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center px-2 h-[22px] rounded-md text-[11.5px] bg-paper-100 dark:bg-paper-900 text-paper-700 dark:text-paper-200 border border-paper-200/70 dark:border-paper-800"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </Section>
      )}

      {meeting.action_items.length > 0 && (
        <Section
          n="02"
          title="Action items"
          icon="check-square"
          open={open.actions}
          onToggle={() => toggle("actions")}
          count={`${open_actions.length}/${total}`}
          tint="flame"
        >
          <div className="-mx-4 px-4 pb-3 -mt-1 mb-2">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] mb-1.5">
              <span className="text-paper-700 dark:text-paper-200 font-medium">
                <span className="text-flame-600 dark:text-flame-400 tabular-nums">
                  {doneCount}
                </span>
                <span className="text-paper-400 dark:text-paper-500">
                  {" "}
                  / {total} done
                </span>
              </span>
              <span className="text-paper-400 dark:text-paper-500">{pct}%</span>
            </div>
            <div className="flex gap-1">
              {meeting.action_items.map((a) => (
                <div
                  key={a.id}
                  className={`flex-1 h-1 rounded-sm ${
                    a.status === "done"
                      ? "bg-flame-500"
                      : "bg-paper-200 dark:bg-paper-800"
                  }`}
                />
              ))}
            </div>
          </div>

          {open_actions.length > 0 && (
            <>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400 mt-3 mb-1 px-2">
                Open · {open_actions.length}
              </div>
              <ul className="-mx-2">
                {open_actions.map((a) => (
                  <ActionRow
                    key={a.id}
                    item={a}
                    onToggle={() =>
                      onActionToggle(a, a.status === "done" ? "open" : "done")
                    }
                  />
                ))}
              </ul>
            </>
          )}
          {done_actions.length > 0 && (
            <>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper-400 dark:text-paper-500 mt-3 mb-1 px-2">
                Done · {done_actions.length}
              </div>
              <ul className="-mx-2">
                {done_actions.map((a) => (
                  <ActionRow
                    key={a.id}
                    item={a}
                    onToggle={() =>
                      onActionToggle(a, a.status === "done" ? "open" : "done")
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {meeting.segments.length > 0 && (
        <Section
          n="03"
          title="Transcript"
          icon="align-left"
          open={open.transcript}
          onToggle={() => toggle("transcript")}
          count={String(meeting.segments.length)}
          tint="ink"
        >
          <TranscriptBody
            segments={meeting.segments}
            speakers={speakers}
            onPlay={seekTo}
          />
        </Section>
      )}

      <div className="h-6" />
    </>
  );
}

// ---------- Failed body ----------
function FailedBody({
  meeting,
  onRetry,
}: {
  meeting: Meeting;
  onRetry?: () => void;
}) {
  const errCode = meeting.status === "cancelled" ? "cancelled" : "err_unknown";
  return (
    <div className="p-4">
      <div className="border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 rounded-xl overflow-hidden">
        <div className="px-4 pt-3 pb-2.5 flex items-center gap-2 border-b border-red-200/70 dark:border-red-900/60 font-mono text-[10px] uppercase tracking-[0.14em] text-red-700 dark:text-red-400">
          <Icon name="info" size={11} />
          Error · {errCode}
          <span className="ml-auto">{formatRelative(meeting.created_at)}</span>
        </div>
        <div className="p-4">
          <div className="text-[14px] font-semibold tracking-[-0.01em] text-red-900 dark:text-red-200">
            {meeting.status === "cancelled"
              ? "Recording cancelled"
              : "Processing failed"}
          </div>
          <p className="text-[12.5px] mt-1.5 text-red-800/85 dark:text-red-300/85 leading-[1.55]">
            {meeting.error_message ??
              "We couldn’t finish this recording. The audio file may be corrupted, or processing was interrupted."}
          </p>
          {onRetry && (
            <div className="mt-4 flex items-center gap-2">
              <Button variant="danger" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Section (collapsible) ----------
function Section({
  n,
  title,
  icon,
  count,
  open,
  onToggle,
  children,
  tint,
}: {
  n: string;
  title: string;
  icon: IconName | (string & {});
  count?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  tint?: "flame" | "ink";
}) {
  const tintBg =
    tint === "flame"
      ? "bg-flame-50/60 dark:bg-flame-950/15"
      : tint === "ink"
      ? "bg-paper-100/50 dark:bg-paper-900/30"
      : "";
  return (
    <section
      className={`border-b border-paper-200 dark:border-paper-800 ${tintBg}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-paper-100/60 dark:hover:bg-paper-900/40 transition-colors"
      >
        <span className="font-mono text-[10.5px] tabular-nums text-paper-400 dark:text-paper-500">
          {n}
        </span>
        <Icon
          name={icon}
          size={13}
          className="text-paper-500 dark:text-paper-400"
        />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">
          {title}
        </span>
        {count != null && (
          <span className="font-mono text-[10px] tabular-nums text-paper-400 dark:text-paper-500 uppercase tracking-wider">
            {count}
          </span>
        )}
        <span className="ml-auto">
          <Icon
            name={open ? "minus" : "plus"}
            size={13}
            strokeWidth={2}
            className="text-paper-400 dark:text-paper-500"
          />
        </span>
      </button>
      {open && <div className="px-4 pb-4 animate-fade-up">{children}</div>}
    </section>
  );
}

// ---------- Action row ----------
function ActionRow({
  item,
  onToggle,
}: {
  item: ActionItem;
  onToggle: () => void;
}) {
  const done = item.status === "done";
  return (
    <li>
      <div className="flex items-start gap-2.5 py-2.5 px-2 rounded-md hover:bg-paper-100/60 dark:hover:bg-paper-900/40">
        <button
          onClick={onToggle}
          aria-label={done ? "Mark open" : "Mark done"}
          className={`mt-[2px] w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
            done
              ? "bg-paper-900 dark:bg-paper-100 border-paper-900 dark:border-paper-100 text-paper-50 dark:text-paper-900"
              : "border-paper-300 dark:border-paper-700 hover:border-flame-500"
          }`}
        >
          {done && <Icon name="check" size={11} strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div
            className={`text-[13px] leading-snug tracking-[-0.005em] ${
              done
                ? "line-through text-paper-400 dark:text-paper-500"
                : "text-paper-800 dark:text-paper-100"
            }`}
          >
            {item.task}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {item.assignee ? (
              <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded-md bg-paper-100 dark:bg-paper-900 text-[10.5px] font-medium text-paper-700 dark:text-paper-200 border border-paper-200/70 dark:border-paper-800">
                <span className="w-3 h-3 rounded-sm bg-flame-500 text-white text-[8px] flex items-center justify-center font-semibold">
                  {item.assignee.charAt(0).toUpperCase()}
                </span>
                {item.assignee}
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 h-[18px] rounded-md border border-dashed border-paper-300 dark:border-paper-700 text-[10.5px] text-paper-500 dark:text-paper-400">
                Unassigned
              </span>
            )}
            {item.due_date && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 h-[18px] rounded-md font-mono text-[10px] tabular-nums uppercase tracking-[0.08em] ${
                  done
                    ? "text-paper-400 dark:text-paper-500 bg-paper-100/60 dark:bg-paper-900/40"
                    : "text-flame-800 dark:text-flame-300 bg-flame-100 dark:bg-flame-900/40"
                }`}
              >
                <Icon name="calendar" size={9} />
                {item.due_date}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ---------- Transcript body (speakers legend + Find + segments) ----------
function TranscriptBody({
  segments,
  speakers,
  onPlay,
}: {
  segments: Segment[];
  speakers: Map<string | null, SpeakerStyle>;
  onPlay: (sec: number) => void;
}) {
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed) return segments;
    const q = trimmed.toLowerCase();
    return segments.filter(
      (s) =>
        s.text.toLowerCase().includes(q) ||
        (s.speaker?.toLowerCase().includes(q) ?? false)
    );
  }, [segments, trimmed]);

  const toggleFind = () => {
    setFindOpen((v) => {
      const next = !v;
      if (!next) setQuery("");
      else queueMicrotask(() => inputRef.current?.focus());
      return next;
    });
  };

  return (
    <>
      {/* Speakers legend + Find toggle */}
      <div className="-mx-4 px-4 pb-3 -mt-1 mb-1 flex items-center gap-3 flex-wrap">
        {Array.from(speakers).map(([name, style]) => (
          <div
            key={name ?? "unknown"}
            className="inline-flex items-center gap-1.5"
          >
            <span className={`w-2 h-2 rounded-sm ${style.dot}`} />
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.12em] ${style.accent}`}
            >
              {name ?? "Unknown"}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={toggleFind}
          className={`ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] flex items-center gap-1 transition-colors ${
            findOpen
              ? "text-paper-900 dark:text-paper-50"
              : "text-paper-500 hover:text-paper-900 dark:hover:text-paper-50"
          }`}
        >
          <Icon name="search" size={10} /> Find
        </button>
      </div>

      {findOpen && (
        <div className="-mx-2 mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Icon
              name="search"
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-paper-400 dark:text-paper-500"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") toggleFind();
              }}
              placeholder="Search transcript…"
              className="w-full h-8 pl-8 pr-3 rounded-md bg-paper-100 dark:bg-paper-900 border border-paper-200 dark:border-paper-800 text-[12.5px] placeholder:text-paper-400 dark:placeholder:text-paper-500 focus:border-flame-500 focus:ring-2 focus:ring-flame-500/15 outline-none transition"
            />
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] tabular-nums text-paper-500 dark:text-paper-400 shrink-0">
            {trimmed
              ? `${filtered.length}/${segments.length}`
              : `${segments.length}`}
          </span>
        </div>
      )}

      <div className="space-y-3 pt-1">
        {filtered.length === 0 ? (
          <p className="text-center text-[12px] text-paper-500 dark:text-paper-400 py-6">
            No matches for “{trimmed}”
          </p>
        ) : (
          filtered.map((s) => (
            <TranscriptRow
              key={s.idx}
              segment={s}
              style={speakers.get(s.speaker) ?? SPEAKER_PALETTE[0]}
              onPlay={() => onPlay(s.start_sec)}
              highlight={trimmed}
            />
          ))
        )}
      </div>
    </>
  );
}

// ---------- Transcript row ----------
function TranscriptRow({
  segment,
  style,
  onPlay,
  highlight,
}: {
  segment: Segment;
  style: SpeakerStyle;
  onPlay: () => void;
  highlight?: string;
}) {
  return (
    <div className="group flex gap-3 -mx-2 px-2 py-1.5 rounded-md hover:bg-paper-100/60 dark:hover:bg-paper-900/40 relative">
      <div className="font-mono tabular-nums text-[10px] text-paper-400 dark:text-paper-500 pt-[3px] w-9 shrink-0">
        {formatDuration(segment.start_sec)}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] font-medium ${style.accent}`}
        >
          <span className={`w-1.5 h-1.5 rounded-sm ${style.dot}`} />
          {segment.speaker ?? "Unknown"}
        </div>
        <div className="text-[13px] leading-[1.55] text-paper-800 dark:text-paper-200 mt-0.5">
          <Highlight text={segment.text} query={highlight} />
        </div>
      </div>
      <button
        type="button"
        onClick={onPlay}
        title="Play from here"
        className="absolute right-1 top-1 w-6 h-6 rounded-md bg-paper-50 dark:bg-paper-900 border border-paper-200 dark:border-paper-800 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-paper-700 dark:text-paper-200 shadow-sm"
      >
        <Icon name="arrow-right" size={11} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ---------- Inline highlight ----------
// Splits `text` on every case-insensitive occurrence of `query` and wraps
// matches in a styled <mark>. No regex escaping needed because we use plain
// string indexOf — query is treated as a literal substring.
function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const out: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const hit = lower.indexOf(q, i);
    if (hit === -1) {
      out.push(text.slice(i));
      break;
    }
    if (hit > i) out.push(text.slice(i, hit));
    out.push(
      <mark
        key={key++}
        className="bg-flame-200 dark:bg-flame-500/30 text-paper-900 dark:text-paper-50 rounded-[2px] px-0.5"
      >
        {text.slice(hit, hit + q.length)}
      </mark>
    );
    i = hit + q.length;
  }
  return <>{out}</>;
}

// ---------- Audio bar ----------
function AudioBar({
  url,
  error,
  onReload,
  audioRef,
}: {
  url: string | null;
  error: string | null;
  onReload: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}) {
  if (error) {
    return (
      <div className="px-4 py-2.5 border-b border-paper-200 dark:border-paper-800 text-[11.5px] text-paper-500 dark:text-paper-400 flex items-center gap-2">
        Audio unavailable: {error}
        <button
          onClick={onReload}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-flame-600 hover:text-flame-700"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="px-4 py-2.5 border-b border-paper-200 dark:border-paper-800 text-[11.5px] text-paper-500 dark:text-paper-400">
        Loading audio…
      </div>
    );
  }
  return (
    <div className="px-4 py-2 border-b border-paper-200 dark:border-paper-800 bg-paper-100/40 dark:bg-paper-900/40">
      <audio ref={audioRef} src={url} controls className="w-full h-9" />
    </div>
  );
}

function deriveSpeakers(
  segments: Segment[]
): Map<string | null, SpeakerStyle> {
  const seen = new Map<string | null, SpeakerStyle>();
  let i = 0;
  for (const s of segments) {
    if (!seen.has(s.speaker)) {
      seen.set(s.speaker, SPEAKER_PALETTE[i % SPEAKER_PALETTE.length]);
      i++;
    }
  }
  return seen;
}

// ---------- MarkedText ----------
// Renders a server-supplied string that may contain literal <mark>...</mark>
// tags (produced by Claude in summary.tldr). Defense in depth: we don't use
// dangerouslySetInnerHTML — instead we tokenize on case-insensitive <mark>
// and </mark> only, and React text-escapes everything else. Any other tag
// Claude might emit renders as plain text rather than executing.
function MarkedText({ html }: { html: string | null }) {
  if (!html) return null;
  const out: React.ReactNode[] = [];
  const re = /<\/?mark\s*>/gi;
  let lastIndex = 0;
  let inMark = false;
  let buf = "";
  let key = 0;
  const flush = () => {
    if (!buf) return;
    if (inMark) {
      out.push(
        <mark
          key={key++}
          className="bg-flame-200/70 dark:bg-flame-500/25 text-flame-900 dark:text-flame-200 rounded-[2px] px-0.5"
        >
          {buf}
        </mark>
      );
    } else {
      out.push(<span key={key++}>{buf}</span>);
    }
    buf = "";
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    buf += html.slice(lastIndex, m.index);
    flush();
    inMark = m[0].toLowerCase().startsWith("</") ? false : true;
    lastIndex = re.lastIndex;
  }
  buf += html.slice(lastIndex);
  flush();
  return <>{out}</>;
}
