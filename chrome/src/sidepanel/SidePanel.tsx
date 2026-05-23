import { useEffect, useState } from "react";
import {
  getMeeting,
  toggleActionItem,
  type ActionItem,
  type Meeting,
} from "../api/meetings";
import { loadSession, type Session } from "../auth/session";
import { STATE_KEY, type CaptureState } from "../state";

export function SidePanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [snapshot, setSnapshot] = useState<CaptureState>({ state: "idle" });
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  // Fetch meeting whenever we have a meetingId. Re-fetch on a polling cadence
  // while processing.
  useEffect(() => {
    const id = snapshot.meetingId;
    if (!id || !session) {
      setMeeting(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const m = await getMeeting(id);
        if (cancelled) return;
        setMeeting(m);
        setFetchError(null);
        // Promote terminal backend status into shared capture state so the
        // popup and the polling loop both see the transition.
        if (
          snapshot.state === "processing" &&
          (m.status === "done" || m.status === "failed" || m.status === "cancelled")
        ) {
          await chrome.storage.local.set({
            [STATE_KEY]: {
              ...snapshot,
              state: m.status === "done" ? "done" : "failed",
              lastEvent:
                m.status === "done" ? "Done" : m.error_message ?? `Status: ${m.status}`,
            },
          });
        }
      } catch (err) {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    if (snapshot.state === "processing") {
      const handle = window.setInterval(load, 3000);
      return () => {
        cancelled = true;
        window.clearInterval(handle);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [snapshot.meetingId, snapshot.state, session]);

  if (!authChecked) {
    return <Shell><p className="empty">Loading…</p></Shell>;
  }

  if (!session) {
    return (
      <Shell>
        <p className="empty">Sign in via the OttoNote popup to see meeting results here.</p>
      </Shell>
    );
  }

  if (snapshot.state === "idle" && !meeting) {
    return (
      <Shell>
        <p className="empty">No active meeting. Click the OttoNote icon to start recording.</p>
      </Shell>
    );
  }

  if (snapshot.state === "recording") {
    return (
      <Shell>
        <p className="empty">Recording in progress. Results will appear here once processing finishes.</p>
      </Shell>
    );
  }

  if (snapshot.state === "uploading" || snapshot.state === "processing") {
    return (
      <Shell>
        <p className="empty">{snapshot.lastEvent ?? "Processing…"}</p>
      </Shell>
    );
  }

  if (fetchError) {
    return (
      <Shell>
        <p className="empty error">Couldn't load meeting: {fetchError}</p>
      </Shell>
    );
  }

  if (!meeting) {
    return <Shell><p className="empty">Loading meeting…</p></Shell>;
  }

  return (
    <Shell>
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
            // Revert on failure.
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
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sidepanel">
      <header className="sp-header">
        <h1>OttoNote</h1>
      </header>
      <div className="sp-body">{children}</div>
    </div>
  );
}

function MeetingView({
  meeting,
  onActionItemToggle,
}: {
  meeting: Meeting;
  onActionItemToggle: (item: ActionItem, status: "open" | "done") => void;
}) {
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
      </section>

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
              <div className="sp-turn" key={s.idx}>
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
  // Stable colour per label.
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
