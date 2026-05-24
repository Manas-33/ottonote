import { useEffect, useRef, useState } from "react";
import { getMeeting } from "../api/meetings";
import { clearSession, loadSession, type Session } from "../auth/session";
import { setState, STATE_KEY, type CaptureState } from "../state";
import { initialsFromEmail } from "./format";
import { Idle } from "./screens/Idle";
import { MeetingDetail } from "./screens/MeetingDetail";
import { Processing } from "./screens/Processing";
import { Recording } from "./screens/Recording";
import { SignedOut } from "./screens/SignedOut";
import { Uploading } from "./screens/Uploading";

export function SidePanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [snapshot, setSnapshot] = useState<CaptureState>({ state: "idle" });
  // null = follow capture state; string = user clicked a library row.
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // ---- session ----
  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setAuthChecked(true);
    });
  }, []);

  // ---- capture-state subscription ----
  useEffect(() => {
    chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: s }) => {
      if (s) setSnapshot(s);
    });
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes[STATE_KEY]) {
        setSnapshot(changes[STATE_KEY].newValue ?? { state: "idle" });
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // ---- auto-follow new captures ----
  // When a recording starts, drop any pinned meeting so the user's screen
  // tracks the in-flight capture rather than the meeting they were viewing.
  const prevState = useRef<CaptureState["state"] | undefined>();
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = snapshot.state;
    if (snapshot.state === "recording" && prev !== "recording") {
      setPinnedId(null);
    }
  }, [snapshot.state]);

  // ---- terminal-state promotion ----
  // The Processing screen is shown while snapshot.state="processing". Backend
  // doesn't notify us when transcription finishes, so we poll the meeting and
  // bump the capture state forward when it terminates.
  useEffect(() => {
    if (snapshot.state !== "processing" || !snapshot.meetingId) return;
    const meetingId = snapshot.meetingId;
    let cancelled = false;
    const tick = async () => {
      try {
        const m = await getMeeting(meetingId);
        if (cancelled) return;
        if (
          m.status === "done" ||
          m.status === "failed" ||
          m.status === "cancelled"
        ) {
          await setState({
            state: m.status === "done" ? "done" : "failed",
            lastEvent:
              m.status === "done"
                ? "Done"
                : m.error_message ?? `Status: ${m.status}`,
          });
        }
      } catch {
        /* try again next tick */
      }
    };
    tick();
    const handle = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [snapshot.state, snapshot.meetingId]);

  const initials = session ? initialsFromEmail(session.email) : undefined;

  const signOut = async () => {
    await clearSession();
    setSession(null);
  };

  const startRecording = () => {
    chrome.runtime.sendMessage({ type: "ottonote/start" });
  };

  const exitDetail = async () => {
    setPinnedId(null);
    // If we're viewing the just-finished capture, end its lifecycle so the
    // next Idle render doesn't re-route us back into MeetingDetail.
    if (snapshot.state === "done" || snapshot.state === "failed") {
      await chrome.storage.local.set({ [STATE_KEY]: { state: "idle" } });
    }
  };

  // ---- routing ----

  if (!authChecked) return <Bootstrapping />;
  if (!session) return <SignedOut onSignedIn={setSession} />;

  // Pinned meeting wins over capture (except during active recording, which
  // the auto-follow effect above already enforces by clearing the pin).
  if (pinnedId) {
    return (
      <MeetingDetail
        meetingId={pinnedId}
        onBack={exitDetail}
        onDeleted={exitDetail}
      />
    );
  }

  switch (snapshot.state) {
    case "recording":
      return <Recording snapshot={snapshot} initials={initials} />;
    case "uploading":
      return <Uploading snapshot={snapshot} initials={initials} />;
    case "processing":
      return <Processing snapshot={snapshot} initials={initials} />;
    case "done":
    case "failed":
      if (snapshot.meetingId) {
        return (
          <MeetingDetail
            meetingId={snapshot.meetingId}
            onBack={exitDetail}
            onDeleted={exitDetail}
          />
        );
      }
      // Fall through to Idle when no meetingId (start itself failed).
      return (
        <Idle
          session={session}
          onStart={startRecording}
          onOpenMeeting={setPinnedId}
          onSignOut={signOut}
        />
      );
    case "idle":
    default:
      return (
        <Idle
          session={session}
          onStart={startRecording}
          onOpenMeeting={setPinnedId}
          onSignOut={signOut}
        />
      );
  }
}

function Bootstrapping() {
  return (
    <div className="h-full flex items-center justify-center bg-paper-50 dark:bg-paper-950">
      <p className="text-[12.5px] text-paper-500 dark:text-paper-400">
        Loading…
      </p>
    </div>
  );
}
