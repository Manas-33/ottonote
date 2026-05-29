import * as chrono from "chrono-node";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Meeting, CalendarEvent as MeetingCalEvent } from "../../api/meetings";
import { config } from "../../config";
import {
  connectGoogle,
  createCalendarEvent,
  disconnectGoogle,
  isGoogleConnected,
  type CalendarEventInput,
} from "../../integrations/google";
import {
  connectSlack,
  disconnectSlack,
  isSlackConnected,
  listChannels,
  postMeetingToSlack,
  type SlackChannel,
} from "../../integrations/slack";
import {
  connectNotion,
  createMeetingPage,
  disconnectNotion,
  isNotionConnected,
  searchPages,
  type NotionPage,
} from "../../integrations/notion";
import { Icon } from "../ui";

type Dialog = "calendar" | "slack" | "notion" | null;

export function ShareMenu({ meeting }: { meeting: Meeting }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [googleOk, setGoogleOk] = useState(false);
  const [slackOk, setSlackOk] = useState(false);
  const [notionOk, setNotionOk] = useState(false);

  useEffect(() => {
    isGoogleConnected().then(setGoogleOk);
    isSlackConnected().then(setSlackOk);
    isNotionConnected().then(setNotionOk);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleConnect = async (
    provider: "google" | "slack" | "notion"
  ) => {
    try {
      if (provider === "google") {
        await connectGoogle();
        setGoogleOk(true);
      } else if (provider === "slack") {
        await connectSlack();
        setSlackOk(true);
      } else {
        await connectNotion();
        setNotionOk(true);
      }
    } catch (err) {
      window.alert(
        `Connection failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleDisconnect = async (provider: "google" | "slack" | "notion") => {
    if (provider === "google") {
      await disconnectGoogle();
      setGoogleOk(false);
    } else if (provider === "slack") {
      await disconnectSlack();
      setSlackOk(false);
    } else {
      await disconnectNotion();
      setNotionOk(false);
    }
  };

  const openShare = (target: Dialog) => {
    setOpen(false);
    setDialog(target);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Share"
        aria-label="Share"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-md flex items-center justify-center text-paper-500 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-paper-900 hover:text-paper-900 dark:hover:text-paper-50 transition-colors"
      >
        <Icon name="share-2" size={13} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-paper-200 dark:border-paper-800 bg-paper-50 dark:bg-paper-900 shadow-lg z-30 py-1 animate-fade-up">
          <div className="px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper-400 dark:text-paper-500">
            Share to
          </div>

          <IntegrationRow
            icon="calendar"
            label="Google Calendar"
            connected={googleOk}
            configured={!!config.googleClientId}
            onConnect={() => handleConnect("google")}
            onDisconnect={() => handleDisconnect("google")}
            onShare={() => openShare("calendar")}
          />
          <IntegrationRow
            icon="message-square"
            label="Slack"
            connected={slackOk}
            configured={!!config.slackClientId}
            onConnect={() => handleConnect("slack")}
            onDisconnect={() => handleDisconnect("slack")}
            onShare={() => openShare("slack")}
          />
          <IntegrationRow
            icon="book-open"
            label="Notion"
            connected={notionOk}
            configured={!!config.notionClientId}
            onConnect={() => handleConnect("notion")}
            onDisconnect={() => handleDisconnect("notion")}
            onShare={() => openShare("notion")}
          />
        </div>
      )}

      {dialog === "calendar" &&
        createPortal(
          <CalendarDialog
            meeting={meeting}
            onClose={() => setDialog(null)}
          />,
          document.body
        )}
      {dialog === "slack" &&
        createPortal(
          <SlackDialog
            meeting={meeting}
            onClose={() => setDialog(null)}
          />,
          document.body
        )}
      {dialog === "notion" &&
        createPortal(
          <NotionDialog
            meeting={meeting}
            onClose={() => setDialog(null)}
          />,
          document.body
        )}
    </div>
  );
}

function IntegrationRow({
  icon,
  label,
  connected,
  configured,
  onConnect,
  onDisconnect,
  onShare,
}: {
  icon: string;
  label: string;
  connected: boolean;
  configured: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onShare: () => void;
}) {
  if (!configured) {
    return (
      <div className="px-3 py-2 flex items-center gap-2.5 text-paper-400 dark:text-paper-500 cursor-default">
        <Icon name={icon} size={14} />
        <span className="text-[12px] flex-1">{label}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider">
          Not configured
        </span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 flex items-center gap-2.5 group">
      <Icon
        name={icon}
        size={14}
        className="text-paper-600 dark:text-paper-300"
      />
      <span className="text-[12px] flex-1 text-paper-800 dark:text-paper-200">
        {label}
      </span>
      {connected ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onShare}
            className="px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-flame-500 text-white hover:bg-flame-600 transition-colors"
          >
            Share
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            title="Disconnect"
            className="w-5 h-5 rounded flex items-center justify-center text-paper-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Icon name="log-out" size={10} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className="px-2 py-0.5 rounded-md text-[10.5px] font-medium border border-paper-200 dark:border-paper-700 text-paper-700 dark:text-paper-200 hover:bg-paper-100 dark:hover:bg-paper-800 transition-colors"
        >
          Connect
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay shell for share dialogs
// ---------------------------------------------------------------------------
function DialogOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-paper-50 dark:bg-paper-950 flex flex-col">
      <div className="flex items-center px-4 py-3 border-b border-paper-200 dark:border-paper-800 shrink-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] flex-1">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-paper-100 dark:hover:bg-paper-900 flex items-center justify-center text-paper-500"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto otto-scroll p-4">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google Calendar dialog
// ---------------------------------------------------------------------------
type CalendarRow = MeetingCalEvent & {
  checked: boolean;
  startDT: string;
  endDT: string;
};

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseWhenText(
  whenText: string,
  referenceDate: Date
): { start: string; end: string } {
  const parsed = chrono.parse(whenText, referenceDate);
  if (parsed.length > 0) {
    const result = parsed[0];
    const startDate = result.start.date();
    const endDate = result.end ? result.end.date() : new Date(startDate.getTime() + 3600_000);
    return { start: toLocalISO(startDate), end: toLocalISO(endDate) };
  }
  // Fallback: use reference date + 1 day at 9:00 AM
  const fallback = new Date(referenceDate);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(9, 0, 0, 0);
  const fallbackEnd = new Date(fallback.getTime() + 3600_000);
  return { start: toLocalISO(fallback), end: toLocalISO(fallbackEnd) };
}

function CalendarDialog({
  meeting,
  onClose,
}: {
  meeting: Meeting;
  onClose: () => void;
}) {
  const referenceDate = new Date(meeting.created_at);
  const [rows, setRows] = useState<CalendarRow[]>(() =>
    meeting.calendar_events.map((ev) => {
      const { start, end } = parseWhenText(ev.when_text, referenceDate);
      return {
        ...ev,
        checked: ev.confidence >= 0.8,
        startDT: start,
        endDT: end,
      };
    })
  );
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<
    { title: string; link: string; error?: string }[]
  >([]);

  const toggle = (i: number) =>
    setRows((r) =>
      r.map((row, j) => (j === i ? { ...row, checked: !row.checked } : row))
    );

  const updateField = (
    i: number,
    field: "startDT" | "endDT",
    val: string
  ) =>
    setRows((r) =>
      r.map((row, j) => (j === i ? { ...row, [field]: val } : row))
    );

  const handleSend = async () => {
    const selected = rows.filter((r) => r.checked);
    if (selected.length === 0) return;
    setSending(true);
    const out: { title: string; link: string; error?: string }[] = [];
    for (const row of selected) {
      try {
        const input: CalendarEventInput = {
          title: row.title,
          startDateTime: new Date(row.startDT).toISOString(),
          endDateTime: new Date(row.endDT).toISOString(),
          description: row.description ?? undefined,
        };
        const { htmlLink } = await createCalendarEvent(input);
        out.push({ title: row.title, link: htmlLink });
      } catch (err) {
        out.push({
          title: row.title,
          link: "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setResults(out);
    setSending(false);
  };

  if (results.length > 0) {
    return (
      <DialogOverlay title="Google Calendar" onClose={onClose}>
        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-[12.5px] p-2 rounded-md ${
                r.error
                  ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                  : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              <Icon name={r.error ? "alert-triangle" : "check"} size={12} />
              <span className="flex-1 truncate">{r.title}</span>
              {r.link && (
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener"
                  className="text-[10px] font-mono uppercase tracking-wider hover:underline"
                >
                  Open
                </a>
              )}
              {r.error && (
                <span className="text-[10px] truncate max-w-[120px]">
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full h-9 rounded-lg bg-paper-900 dark:bg-paper-100 text-paper-50 dark:text-paper-900 text-[12.5px] font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </DialogOverlay>
    );
  }

  return (
    <DialogOverlay title="Google Calendar" onClose={onClose}>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-paper-500 text-center py-6">
          No calendar events extracted from this meeting.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`p-3 rounded-lg border transition-colors ${
                row.checked
                  ? "border-flame-300 dark:border-flame-700 bg-flame-50/50 dark:bg-flame-950/20"
                  : "border-paper-200 dark:border-paper-800"
              }`}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={() => toggle(i)}
                  className="mt-0.5 accent-flame-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-paper-800 dark:text-paper-100">
                    {row.title}
                  </div>
                  <div className="text-[11px] text-paper-500 dark:text-paper-400 mt-0.5">
                    {row.when_text}
                  </div>
                  {row.checked && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.12em] text-paper-400 mb-0.5">
                          Start
                        </label>
                        <input
                          type="datetime-local"
                          value={row.startDT}
                          onChange={(e) =>
                            updateField(i, "startDT", e.target.value)
                          }
                          className="w-full h-7 px-2 rounded border border-paper-200 dark:border-paper-700 bg-paper-50 dark:bg-paper-900 text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.12em] text-paper-400 mb-0.5">
                          End
                        </label>
                        <input
                          type="datetime-local"
                          value={row.endDT}
                          onChange={(e) =>
                            updateField(i, "endDT", e.target.value)
                          }
                          className="w-full h-7 px-2 rounded border border-paper-200 dark:border-paper-700 bg-paper-50 dark:bg-paper-900 text-[11px]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={handleSend}
        disabled={sending || rows.filter((r) => r.checked).length === 0}
        className="mt-4 w-full h-9 rounded-lg bg-flame-500 hover:bg-flame-600 text-white text-[12.5px] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending
          ? "Creating events…"
          : `Create ${rows.filter((r) => r.checked).length} event${rows.filter((r) => r.checked).length === 1 ? "" : "s"}`}
      </button>
    </DialogOverlay>
  );
}

// ---------------------------------------------------------------------------
// Slack dialog
// ---------------------------------------------------------------------------
function SlackDialog({
  meeting,
  onClose,
}: {
  meeting: Meeting;
  onClose: () => void;
}) {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    permalink: string;
  } | null>(null);

  useEffect(() => {
    listChannels()
      .then((chs) => {
        setChannels(chs);
        if (chs.length > 0) setSelected(chs[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const r = await postMeetingToSlack(meeting, selected);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  };

  return (
    <DialogOverlay title="Share to Slack" onClose={onClose}>
      {result ? (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[13px] font-medium mb-3">
            <Icon name="check" size={14} />
            Posted to Slack
          </div>
          <div>
            <a
              href={result.permalink}
              target="_blank"
              rel="noopener"
              className="text-[12px] text-flame-600 dark:text-flame-400 hover:underline inline-flex items-center gap-1"
            >
              Open in Slack
              <Icon name="external-link" size={10} />
            </a>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full h-9 rounded-lg bg-paper-900 dark:bg-paper-100 text-paper-50 dark:text-paper-900 text-[12.5px] font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-3 p-2 rounded-md bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-[12px] flex items-center gap-1.5">
              <Icon name="alert-triangle" size={11} />
              {error}
            </div>
          )}

          <label className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400 mb-1.5">
            Channel
          </label>
          {loading ? (
            <div className="text-[12px] text-paper-400 py-3">
              Loading channels…
            </div>
          ) : (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-paper-200 dark:border-paper-700 bg-paper-50 dark:bg-paper-900 text-[12.5px]"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  # {c.name}
                </option>
              ))}
            </select>
          )}

          <div className="mt-3">
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400 mb-1.5">
              Preview
            </label>
            <div className="p-3 rounded-lg border border-paper-200 dark:border-paper-800 bg-paper-100/50 dark:bg-paper-900/50 text-[11.5px] text-paper-700 dark:text-paper-300 leading-[1.6] max-h-48 overflow-y-auto otto-scroll whitespace-pre-wrap font-mono">
              {slackPreview(meeting)}
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !selected}
            className="mt-4 w-full h-9 rounded-lg bg-flame-500 hover:bg-flame-600 text-white text-[12.5px] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "Sending…" : "Post to Slack"}
          </button>
        </>
      )}
    </DialogOverlay>
  );
}

function slackPreview(meeting: Meeting): string {
  const lines: string[] = [];
  lines.push(`*${meeting.title ?? "Untitled meeting"}*`);
  if (meeting.summary?.summary) {
    lines.push("", meeting.summary.summary);
  }
  if (meeting.action_items.length > 0) {
    lines.push("", "*Action Items*");
    for (const a of meeting.action_items) {
      lines.push(`• ${a.assignee}: ${a.task}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Notion dialog
// ---------------------------------------------------------------------------
function NotionDialog({
  meeting,
  onClose,
}: {
  meeting: Meeting;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);

  const doSearch = (q: string) => {
    setLoading(true);
    searchPages(q || undefined)
      .then((ps) => {
        setPages(ps);
        if (ps.length > 0 && !selected) setSelected(ps[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    doSearch("");
  }, []);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const r = await createMeetingPage(meeting, selected);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  };

  return (
    <DialogOverlay title="Share to Notion" onClose={onClose}>
      {result ? (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[13px] font-medium mb-3">
            <Icon name="check" size={14} />
            Page created in Notion
          </div>
          <div>
            <a
              href={result.url}
              target="_blank"
              rel="noopener"
              className="text-[12px] text-flame-600 dark:text-flame-400 hover:underline inline-flex items-center gap-1"
            >
              Open in Notion
              <Icon name="external-link" size={10} />
            </a>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full h-9 rounded-lg bg-paper-900 dark:bg-paper-100 text-paper-50 dark:text-paper-900 text-[12.5px] font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-3 p-2 rounded-md bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-[12px] flex items-center gap-1.5">
              <Icon name="alert-triangle" size={11} />
              {error}
            </div>
          )}

          <label className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper-500 dark:text-paper-400 mb-1.5">
            Parent page
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch(query);
              }}
              placeholder="Search pages…"
              className="flex-1 h-8 px-3 rounded-md border border-paper-200 dark:border-paper-700 bg-paper-50 dark:bg-paper-900 text-[12px] placeholder:text-paper-400"
            />
            <button
              type="button"
              onClick={() => doSearch(query)}
              className="h-8 px-3 rounded-md border border-paper-200 dark:border-paper-700 text-[11px] font-medium hover:bg-paper-100 dark:hover:bg-paper-800 transition-colors"
            >
              Search
            </button>
          </div>

          {loading ? (
            <div className="text-[12px] text-paper-400 py-3">
              Searching…
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto otto-scroll border border-paper-200 dark:border-paper-800 rounded-lg">
              {pages.length === 0 ? (
                <div className="p-3 text-[12px] text-paper-400 text-center">
                  No pages found. Make sure OttoNote has access in Notion.
                </div>
              ) : (
                pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 hover:bg-paper-100 dark:hover:bg-paper-800 ${
                      selected === p.id
                        ? "bg-flame-50 dark:bg-flame-950/30 text-paper-900 dark:text-paper-50 font-medium"
                        : "text-paper-700 dark:text-paper-300"
                    }`}
                  >
                    <Icon name="book-open" size={12} className="shrink-0 opacity-50" />
                    <span className="truncate">{p.title}</span>
                    {selected === p.id && (
                      <Icon
                        name="check"
                        size={12}
                        className="ml-auto opacity-60"
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || !selected}
            className="mt-4 w-full h-9 rounded-lg bg-flame-500 hover:bg-flame-600 text-white text-[12.5px] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "Creating page…" : "Create Notion page"}
          </button>
        </>
      )}
    </DialogOverlay>
  );
}
