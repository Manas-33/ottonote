import { useEffect, useRef, useState } from "react";
import { clearSession, loadSession, type Session } from "../auth/session";
import { signInWithPassword } from "../auth/login";
import { getMeeting, type Meeting } from "../api/meetings";
import { resetState, STATE_KEY, type CaptureState } from "../state";

export function Popup() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setAuthLoading(false);
    });
  }, []);

  if (authLoading) {
    return (
      <div className="popup">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginForm onSignedIn={setSession} />;
  }

  return <Recorder session={session} onSignOut={() => setSession(null)} />;
}

function LoginForm({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await signInWithPassword(email, password);
      onSignedIn(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="popup">
      <header>
        <h1>OttoNote</h1>
      </header>
      <form onSubmit={submit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

function Recorder({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CaptureState>({ state: "idle" });
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number | null>(null);

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

  useEffect(() => {
    if (snapshot.state === "recording" && snapshot.startedAt) {
      const tick = () =>
        setElapsed(Math.floor((Date.now() - snapshot.startedAt!) / 1000));
      tick();
      timer.current = window.setInterval(tick, 1000);
      return () => {
        if (timer.current) window.clearInterval(timer.current);
      };
    }
    setElapsed(0);
  }, [snapshot.state, snapshot.startedAt]);

  // Poll backend while processing.
  useEffect(() => {
    if (snapshot.state !== "processing" || !snapshot.meetingId) {
      return;
    }
    let cancelled = false;
    const id = snapshot.meetingId;
    const poll = async () => {
      try {
        const m = await getMeeting(id);
        if (cancelled) return;
        setMeeting(m);
        if (m.status === "done" || m.status === "failed" || m.status === "cancelled") {
          await chrome.storage.local.set({
            [STATE_KEY]: {
              state: m.status === "done" ? "done" : "failed",
              meetingId: id,
              lastEvent:
                m.status === "done"
                  ? "Done"
                  : m.error_message ?? `Status: ${m.status}`,
            },
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
      }
    };
    poll();
    const handle = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [snapshot.state, snapshot.meetingId]);

  // Hydrate meeting view from backend when popup reopens onto a done meeting.
  useEffect(() => {
    if (snapshot.state === "done" && snapshot.meetingId && !meeting) {
      getMeeting(snapshot.meetingId).then(setMeeting).catch(console.error);
    }
  }, [snapshot.state, snapshot.meetingId, meeting]);

  const start = async () => {
    setBusy(true);
    setMeeting(null);
    await chrome.runtime.sendMessage({ type: "ottonote/start" });
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    await chrome.runtime.sendMessage({ type: "ottonote/stop" });
    setBusy(false);
  };

  const reset = async () => {
    setMeeting(null);
    await resetState();
  };

  const signOut = async () => {
    await clearSession();
    onSignOut();
  };

  const recording = snapshot.state === "recording";
  const terminal = snapshot.state === "done" || snapshot.state === "failed";

  return (
    <div className="popup">
      <header>
        <h1>OttoNote</h1>
        <span className="account">{session.email ?? session.userId}</span>
      </header>
      <main>
        {!terminal && (
          <button
            className="primary"
            onClick={recording ? stop : start}
            disabled={busy || snapshot.state === "uploading"}
          >
            {recording ? "Stop recording" : "Start recording"}
          </button>
        )}
        {recording && <p className="timer">{formatDuration(elapsed)}</p>}
        {!terminal && (
          <p className="hint">
            {recording
              ? "Capturing this tab's audio. Don't close the tab."
              : "Open the meeting tab, then click start."}
          </p>
        )}
        {snapshot.lastEvent && <p className="status">› {snapshot.lastEvent}</p>}

        {snapshot.state === "done" && meeting && <MeetingResult meeting={meeting} />}

        {terminal && (
          <button className="primary" onClick={reset}>
            New recording
          </button>
        )}
        <button className="secondary" onClick={signOut}>
          Sign out
        </button>
      </main>
    </div>
  );
}

function MeetingResult({ meeting }: { meeting: Meeting }) {
  return (
    <div className="result">
      {meeting.summary?.summary && (
        <>
          <h2>Summary</h2>
          <p>{meeting.summary.summary}</p>
        </>
      )}
      {meeting.action_items.length > 0 && (
        <>
          <h2>Action items</h2>
          <ul>
            {meeting.action_items.map((a) => (
              <li key={a.id}>
                <strong>{a.assignee}:</strong> {a.task}
                {a.due_date && <span className="due"> · {a.due_date}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
