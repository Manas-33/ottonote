import { useEffect, useRef, useState } from "react";
import { clearSession, loadSession, type Session } from "../auth/session";
import { signInWithPassword } from "../auth/login";
import { cancelMeeting } from "../api/meetings";
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

async function openSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
      console.error("Failed to open side panel", e);
    }
  }
}

function Recorder({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CaptureState>({ state: "idle" });
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

  const start = async () => {
    setBusy(true);
    // Open the side panel proactively while we still hold a user gesture —
    // results will start streaming in there.
    await openSidePanel();
    await chrome.runtime.sendMessage({ type: "ottonote/start" });
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    await chrome.runtime.sendMessage({ type: "ottonote/stop" });
    setBusy(false);
  };

  const reset = async () => {
    await resetState();
  };

  const cancel = async () => {
    setBusy(true);
    try {
      // Best-effort: tell the backend to revoke the Celery task. If we don't
      // have a meetingId, or the call fails, still wipe local state so the
      // user isn't trapped.
      if (snapshot.meetingId) {
        try {
          await cancelMeeting(snapshot.meetingId);
        } catch (e) {
          console.warn("Cancel call failed; resetting local state anyway", e);
        }
      }
      await resetState();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    onSignOut();
  };

  const recording = snapshot.state === "recording";
  const hasResults = !!snapshot.meetingId;
  const terminal = snapshot.state === "done" || snapshot.state === "failed";
  const inFlight =
    snapshot.state === "uploading" || snapshot.state === "processing";

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

        {hasResults && (
          <button className="secondary" onClick={openSidePanel}>
            Open side panel
          </button>
        )}

        {inFlight && (
          <button className="secondary" onClick={cancel} disabled={busy}>
            Cancel
          </button>
        )}

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
