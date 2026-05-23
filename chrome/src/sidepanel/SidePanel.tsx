import { useEffect, useRef, useState } from "react";
import {
  getAudioUrl,
  getMeeting,
  listMeetings,
  toggleActionItem,
  type ActionItem,
  type Meeting,
  type MeetingSummaryRow,
} from "../api/meetings";
import { loadSession, type Session } from "../auth/session";
import { downloadMarkdown, openPrintable } from "../lib/exports";
import { STATE_KEY, type CaptureState } from "../state";

type View = "list" | string; // "list" or a meeting id

export function SidePanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [snapshot, setSnapshot] = useState<CaptureState>({ state: "idle" });
  // null = follow the in-flight capture; string/list = explicit user choice.
  const [userView, setUserView] = useState<View | null>(null);

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: s }) => {
      if (s) setSnapshot(s);
    });
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STATE_KEY]) {
        setSnapshot(changes[STATE_KEY].newValue ?? { state: "idle" });
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // When a new recording starts, clear any user override so we auto-follow
  // the new meeting.
  const prevStateRef = useRef<string | undefined>();
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = snapshot.state;
    if (snapshot.state === "recording" && prev !== "recording") {
      setUserView(null);
    }
  }, [snapshot.state]);

  if (!authChecked) {
    return (
      <Shell>
        <p className="empty">Loading…</p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <p className="empty">
          Sign in via the OttoNote popup to see meeting results here.
        </p>
      </Shell>
    );
  }

  // Effective view: explicit user choice wins, otherwise follow the capture.
  const effective: View =
    userView ?? (snapshot.meetingId ? snapshot.meetingId : "list");

  if (effective === "list") {
    return (
      <Shell>
        <MeetingList onSelect={(id) => setUserView(id)} />
      </Shell>
    );
  }

  return (
    <Shell
      back={() => setUserView("list")}
      backLabel="Meetings"
    >
      <MeetingDetail
        meetingId={effective}
        snapshot={snapshot}
      />
    </Shell>
  );
}

function Shell({
  children,
  back,
  backLabel,
}: {
  children: React.ReactNode;
  back?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="sidepanel">
      <header className="sp-header">
        {back ? (
          <button className="sp-back" onClick={back}>
            ← {backLabel ?? "Back"}
          </button>
        ) : (
          <h1>OttoNote</h1>
        )}
      </header>
      <div className="sp-body">{children}</div>
    </div>
  );
}

function MeetingList({ onSelect }: { onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<MeetingSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listMeetings()
        .then((rs) => {
          if (!cancelled) {
            setRows(rs);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : String(err));
        });
    };
    load();
    // Re-poll lightly so a freshly-created meeting shows up in the list.
    const handle = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, []);

  if (error) return <p className="empty error">{error}</p>;
  if (!rows) return <p className="empty">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="empty">
        No meetings yet. Click the OttoNote icon to start recording.
      </p>
    );
  }

  return (
    <ul className="sp-list">
      {rows.map((m) => (
        <li key={m.id}>
          <button className="sp-list-row" onClick={() => onSelect(m.id)}>
            <div className="sp-list-title">
              {m.title ?? "Untitled meeting"}
            </div>
            <div className="sp-list-meta">
              <span className={`sp-status sp-status-${m.status}`}>
                {m.status}
              </span>
              {m.duration_sec != null && (
                <span> · {formatDuration(m.duration_sec)}</span>
              )}
              <span> · {formatRelative(m.created_at)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MeetingDetail({
  meetingId,
  snapshot,
}: {
  meetingId: string;
  snapshot: CaptureState;
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const m = await getMeeting(meetingId);
        if (cancelled) return;
        setMeeting(m);
        setFetchError(null);
        // Promote terminal backend status into shared capture state if this
        // meeting matches the in-flight capture.
        if (
          snapshot.meetingId === meetingId &&
          snapshot.state === "processing" &&
          (m.status === "done" || m.status === "failed" || m.status === "cancelled")
        ) {
          await chrome.storage.local.set({
            [STATE_KEY]: {
              ...snapshot,
              state: m.status === "done" ? "done" : "failed",
              lastEvent:
                m.status === "done"
                  ? "Done"
                  : m.error_message ?? `Status: ${m.status}`,
            },
          });
        }
      } catch (err) {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    // Poll while this meeting is the one being processed.
    if (snapshot.meetingId === meetingId && snapshot.state === "processing") {
      const handle = window.setInterval(load, 3000);
      return () => {
        cancelled = true;
        window.clearInterval(handle);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [meetingId, snapshot.state, snapshot.meetingId]);

  // While we're recording the current target, the meeting doesn't exist yet
  // (createMeeting fires on stop). Show a friendly placeholder.
  if (snapshot.meetingId === meetingId && snapshot.state === "recording") {
    return (
      <p className="empty">
        Recording in progress. Results will appear here once processing finishes.
      </p>
    );
  }

  if (
    snapshot.meetingId === meetingId &&
    (snapshot.state === "uploading" || snapshot.state === "processing") &&
    !meeting
  ) {
    return <p className="empty">{snapshot.lastEvent ?? "Processing…"}</p>;
  }

  if (fetchError) {
    return <p className="empty error">Couldn't load meeting: {fetchError}</p>;
  }

  if (!meeting) {
    return <p className="empty">Loading meeting…</p>;
  }

  return (
    <MeetingView
      meeting={meeting}
      onActionItemToggle={(item, status) => {
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
      }}
    />
  );
}

function MeetingView({
  meeting,
  onActionItemToggle,
}: {
  meeting: Meeting;
  onActionItemToggle: (item: ActionItem, status: "open" | "done") => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const resumeAtRef = useRef<{ time: number; play: boolean } | null>(null);

  useEffect(() => {
    if (meeting.status !== "done") return;
    let cancelled = false;
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

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    const resume = resumeAtRef.current;
    if (audio && resume) {
      audio.currentTime = resume.time;
      if (resume.play) audio.play().catch(() => {});
      resumeAtRef.current = null;
    }
  };

  const handleAudioError = () => {
    const audio = audioRef.current;
    if (!audio) return;
    resumeAtRef.current = {
      time: audio.currentTime || 0,
      play: !audio.paused,
    };
    getAudioUrl(meeting.id)
      .then(({ url }) => {
        setAudioUrl(url);
        setAudioError(null);
      })
      .catch((err) => {
        setAudioError(err instanceof Error ? err.message : String(err));
      });
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    audio.play().catch(() => {});
  };

  const activeIdx = meeting.segments.findIndex(
    (s) => currentTime >= s.start_sec && currentTime < s.end_sec
  );

  return (
    <>
      <section className="sp-meta">
        <h2 className="sp-title">{meeting.title ?? "Untitled meeting"}</h2>
        <div className="sp-metabar">
          <Badge>{meeting.status}</Badge>
          {meeting.duration_sec != null && (
            <Badge>{formatDuration(meeting.duration_sec)}</Badge>
          )}
          {meeting.language && <Badge>{meeting.language}</Badge>}
          {meeting.num_speakers != null && (
            <Badge>
              {meeting.num_speakers} speaker
              {meeting.num_speakers === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {meeting.status === "done" && (
          <div className="sp-exports">
            <button onClick={() => downloadMarkdown(meeting)}>
              Export markdown
            </button>
            <button onClick={() => openPrintable(meeting)}>Save as PDF</button>
          </div>
        )}
      </section>

      {meeting.status === "done" && (
        <div className="sp-audio">
          {audioUrl ? (
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleAudioError}
            />
          ) : audioError ? (
            <p className="empty error">Audio unavailable: {audioError}</p>
          ) : (
            <p className="empty">Loading audio…</p>
          )}
        </div>
      )}

      {meeting.summary && (
        <Card title="Summary">
          <p>{meeting.summary.summary}</p>
          {meeting.summary.decisions.length > 0 && (
            <>
              <h4>Decisions</h4>
              <ul>
                {meeting.summary.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </>
          )}
          {meeting.summary.follow_ups.length > 0 && (
            <>
              <h4>Follow-ups</h4>
              <ul>
                {meeting.summary.follow_ups.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {meeting.action_items.length > 0 && (
        <Card title="Action items">
          <ul className="sp-action-list">
            {meeting.action_items.map((a) => (
              <li key={a.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={a.status === "done"}
                    onChange={(e) =>
                      onActionItemToggle(a, e.target.checked ? "done" : "open")
                    }
                  />
                  <span className={a.status === "done" ? "done" : undefined}>
                    <strong>{a.assignee}:</strong> {a.task}
                    {a.due_date && <span className="due"> · {a.due_date}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {meeting.summary && Object.keys(meeting.summary.keywords).length > 0 && (
        <Card title="Keywords">
          {Object.entries(meeting.summary.keywords).map(([category, words]) => (
            <div className="sp-keyword-group" key={category}>
              <h4>{category}</h4>
              <div className="sp-chips">
                {words.map((w, i) => (
                  <span className="sp-chip" key={i}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {meeting.calendar_events.length > 0 && (
        <Card title="Calendar events">
          <ul>
            {meeting.calendar_events.map((c) => (
              <li key={c.id}>
                <strong>{c.title}</strong>
                <span className="due"> · {c.when_text}</span>
                {c.description && <p>{c.description}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {meeting.segments.length > 0 && (
        <Card title="Transcript">
          <div className="sp-transcript">
            {meeting.segments.map((s) => (
              <div
                className={
                  "sp-turn" + (s.idx === activeIdx ? " sp-turn-active" : "")
                }
                key={s.idx}
                onClick={() => seekTo(s.start_sec)}
                role="button"
                tabIndex={0}
              >
                <div
                  className="sp-speaker"
                  style={{ color: speakerColor(s.speaker) }}
                >
                  {s.speaker ?? "Unknown"} · {formatDuration(s.start_sec)}
                </div>
                <div className="sp-text">{s.text}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sp-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="sp-badge">{children}</span>;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "just now";
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const PALETTE = [
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#9333ea",
  "#be123c",
  "#0e7490",
];

function speakerColor(speaker: string | null): string {
  if (!speaker) return "#666";
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
