import { useState } from "react";
import { signInWithPassword } from "../../auth/login";
import type { Session } from "../../auth/session";
import { Icon, Logo } from "../ui";

export function SignedOut({
  onSignedIn,
}: {
  onSignedIn: (session: Session) => void;
}) {
  const [emailMode, setEmailMode] = useState(false);
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
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950 relative overflow-hidden">
      {/* Top masthead strip */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-paper-200/70 dark:border-paper-800/70 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-500 dark:text-paper-400">
        <Logo size={14} />
        <span className="text-paper-800 dark:text-paper-100 font-medium">
          OttoNote
        </span>
        <span className="text-paper-400 dark:text-paper-500">/</span>
        <span>v0.4</span>
        <span className="ml-auto text-paper-400 dark:text-paper-500">
          Chrome side panel
        </span>
      </div>

      {/* Centered hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center -mt-6">
        <Logo size={48} />
        <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-flame-600 dark:text-flame-400">
          ○ Welcome
        </div>
        <h1 className="mt-2 text-[30px] leading-[1] tracking-[-0.03em] font-semibold text-paper-900 dark:text-paper-50">
          OttoNote
        </h1>
        <p className="mt-3 text-[13.5px] text-paper-600 dark:text-paper-400 leading-[1.55] max-w-[280px]">
          Quiet meeting notes. Record any tab, get a transcript, summary, and
          action items.
        </p>
      </div>

      {/* Sign-in cluster */}
      <div className="px-6 pb-6 space-y-2.5">
        {!emailMode ? (
          <>
            <button
              type="button"
              onClick={() => setEmailMode(true)}
              className="w-full h-11 btn-ink rounded-xl flex items-center justify-center gap-2.5 text-[13.5px] font-medium tracking-[-0.005em]"
            >
              <GoogleG />
              <span>Continue with Google</span>
            </button>
            <button
              type="button"
              onClick={() => setEmailMode(true)}
              className="w-full h-11 rounded-xl border border-paper-200 dark:border-paper-800 hover:bg-paper-100 dark:hover:bg-paper-900 text-paper-800 dark:text-paper-100 flex items-center justify-center gap-2.5 text-[13.5px] font-medium tracking-[-0.005em] transition-colors"
            >
              <Icon name="mail" size={14} />
              <span>Continue with email</span>
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-2.5">
            <div className="relative">
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@work.com"
                required
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-transparent border border-paper-200 dark:border-paper-800 text-[13.5px] focus:border-flame-500 focus:ring-2 focus:ring-flame-500/15 outline-none transition placeholder:text-paper-400 dark:placeholder:text-paper-600"
              />
              <Icon
                name="mail"
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-paper-400 dark:text-paper-500"
              />
            </div>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-transparent border border-paper-200 dark:border-paper-800 text-[13.5px] focus:border-flame-500 focus:ring-2 focus:ring-flame-500/15 outline-none transition placeholder:text-paper-400 dark:placeholder:text-paper-600"
              />
              <Icon
                name="lock"
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-paper-400 dark:text-paper-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full h-11 btn-ink rounded-xl flex items-center justify-center gap-2 text-[13.5px] font-medium tracking-[-0.005em] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{busy ? "Signing in…" : "Sign in"}</span>
              {!busy && (
                <Icon name="arrow-right" size={14} className="opacity-60" />
              )}
            </button>
            {error && (
              <p className="text-[11.5px] text-red-600 dark:text-red-400 text-center">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setEmailMode(false);
                setError(null);
              }}
              className="w-full h-9 font-mono text-[10.5px] uppercase tracking-[0.14em] text-paper-500 hover:text-paper-900 dark:hover:text-paper-50 transition-colors"
            >
              ← Back to options
            </button>
          </form>
        )}

        <div className="pt-1.5 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-paper-400 dark:text-paper-500">
          <Icon name="lock" size={10} />
          <span>End-to-end encrypted</span>
          <span className="w-1 h-1 rounded-full bg-paper-300 dark:bg-paper-700" />
          <span>You own your data</span>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.25h2.91c1.7-1.57 2.69-3.88 2.69-6.6z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
