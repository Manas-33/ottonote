import { useEffect, useMemo, useState } from "react";
import {
  listMeetings,
  type MeetingStatus,
  type MeetingSummaryRow,
} from "../../api/meetings";
import type { Session } from "../../auth/session";
import { WorkspaceSwitcher } from "../components/WorkspaceSwitcher";
import {
  dateLabel,
  firstNameFromEmail,
  formatRelative,
  formatShortDuration,
  greeting,
  initialsFromEmail,
  progressInfo,
} from "../format";
import { Icon, PanelMast, StatusChip } from "../ui";
import { useWorkspaces, WORKSPACE_COLOR_CLASSES } from "../workspace";

const NEEDS_TOOLBAR_CLICK_KEY = "ottonote/needs-toolbar-click";

type Group = { label: string; rows: MeetingSummaryRow[] };

export function Idle({
  session,
  onStart,
  onOpenMeeting,
  onSignOut,
}: {
  session: Session;
  onStart: () => void;
  onOpenMeeting: (id: string) => void;
  onSignOut?: () => void;
}) {
  const [rows, setRows] = useState<MeetingSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True when the user opened the side panel via the in-page toast. In that
  // path Chrome did NOT grant activeTab, so tabCapture will fail until they
  // click the toolbar icon. Cleared by the background on action.onClicked.
  const [needsToolbarClick, setNeedsToolbarClick] = useState(false);

  const {
    workspaces,
    selectedId: selectedWorkspaceId,
    setSelected: setSelectedWorkspace,
    refresh: refreshWorkspaces,
  } = useWorkspaces();
  const workspaceById = useMemo(
    () => new Map((workspaces ?? []).map((w) => [w.id, w] as const)),
    [workspaces]
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listMeetings(selectedWorkspaceId ?? undefined)
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
    const handle = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    chrome.storage.local.get(NEEDS_TOOLBAR_CLICK_KEY).then((r) => {
      setNeedsToolbarClick(!!r[NEEDS_TOOLBAR_CLICK_KEY]);
    });
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes[NEEDS_TOOLBAR_CLICK_KEY]) {
        setNeedsToolbarClick(!!changes[NEEDS_TOOLBAR_CLICK_KEY].newValue);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const groups = useMemo<Group[]>(() => groupByRecency(rows ?? []), [rows]);
  const total = rows?.length ?? 0;

  const now = new Date();

  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-paper-950">
      <PanelMast
        initials={initialsFromEmail(session.email)}
        onSettings={onSignOut}
        left={
          <span className="ml-1 chip-sq text-emerald-800 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40">
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500" />
            READY
          </span>
        }
      />

      {/* Greeting */}
      <div className="px-5 pt-5 pb-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-500 dark:text-paper-400">
          {dateLabel(now)}
        </div>
        <h1 className="mt-1.5 text-[22px] leading-[1.1] tracking-[-0.025em] font-semibold text-paper-900 dark:text-paper-50">
          {greeting(now)}, {firstNameFromEmail(session.email)}.
        </h1>
      </div>

      {needsToolbarClick && (
        <div className="px-5 mt-3">
          <div className="rounded-xl border border-flame-300 dark:border-flame-700/60 bg-flame-50 dark:bg-flame-950/40 px-3.5 py-2.5 flex items-start gap-2.5">
            <Icon
              name="info"
              size={14}
              className="text-flame-600 dark:text-flame-400 mt-0.5 shrink-0"
            />
            <div className="flex-1 min-w-0 text-[12px] leading-[1.45] text-flame-900 dark:text-flame-200">
              Click the OttoNote toolbar icon{" "}
              <span aria-hidden="true">↗</span> above to enable recording on
              this tab. Chrome requires it once per tab.
            </div>
          </div>
        </div>
      )}

      {/* Hero record card */}
      <div className="px-5 mt-4">
        <button
          type="button"
          onClick={onStart}
          className="w-full text-left rounded-2xl btn-ink overflow-hidden group"
        >
          <div className="flex items-center gap-4 px-5 py-5">
            <span className="relative w-12 h-12 rounded-full border border-paper-50/15 flex items-center justify-center shrink-0">
              <span className="absolute inset-0 rounded-full border border-flame-500/40 group-hover:animate-rec-ring" />
              <span className="w-3.5 h-3.5 rounded-full bg-flame-500 ring-[3px] ring-flame-500/25" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-semibold tracking-[-0.015em]">
                Start recording
              </span>
              <span className="block text-[11px] mt-1 opacity-55 font-mono uppercase tracking-[0.14em]">
                Capture this tab
              </span>
            </span>
            <Icon name="arrow-right" size={16} className="opacity-40" />
          </div>
        </button>
      </div>

      {/* Library header */}
      <div className="mt-7 px-5 flex items-center gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-700 dark:text-paper-200 font-medium">
          Library
        </h2>
        {total > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-paper-400 dark:text-paper-500">
            {total}
          </span>
        )}
        <span className="flex-1 h-px bg-paper-200 dark:bg-paper-800" />
        {workspaces && (
          <WorkspaceSwitcher
            workspaces={workspaces}
            selectedId={selectedWorkspaceId}
            onSelect={setSelectedWorkspace}
            onMutated={refreshWorkspaces}
          />
        )}
      </div>

      {/* Library body */}
      <div className="mt-2 px-5 pb-4 flex-1 overflow-y-auto otto-scroll space-y-4">
        {error ? (
          <p className="mt-6 text-center text-[12.5px] text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : rows === null ? (
          <p className="mt-6 text-center text-[12.5px] text-paper-500 dark:text-paper-400">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-center text-[12.5px] text-paper-500 dark:text-paper-400">
            No meetings yet. Hit “Start recording” to capture this tab.
          </p>
        ) : (
          groups.map(
            (g) =>
              g.rows.length > 0 && (
                <div key={g.label}>
                  <div className="pb-1.5 flex items-baseline gap-2.5">
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-paper-500 dark:text-paper-400">
                      {g.label}
                    </span>
                    <span className="font-mono text-[9.5px] tabular-nums text-paper-400 dark:text-paper-500">
                      {g.rows.length}
                    </span>
                    <span className="flex-1 h-px bg-paper-200/70 dark:bg-paper-800/70" />
                  </div>
                  <ul>
                    {g.rows.map((m) => {
                      const ws = m.workspace_id
                        ? workspaceById.get(m.workspace_id)
                        : undefined;
                      // Only show the dot in the "All workspaces" view —
                      // when filtered, every row shares the same color.
                      const dotColor =
                        selectedWorkspaceId === null && ws
                          ? WORKSPACE_COLOR_CLASSES[ws.color].dot
                          : null;
                      return (
                        <li key={m.id}>
                          <MeetingRow
                            m={m}
                            dotColor={dotColor}
                            onOpen={() => onOpenMeeting(m.id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
          )
        )}
      </div>
    </div>
  );
}

function MeetingRow({
  m,
  dotColor,
  onOpen,
}: {
  m: MeetingSummaryRow;
  dotColor: string | null;
  onOpen: () => void;
}) {
  const chipStatus = toChipStatus(m.status);
  const isProcessing = m.status === "processing" || m.status === "pending";
  const progress = isProcessing ? progressInfo(m.progress_step) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-paper-100 dark:hover:bg-paper-900 transition-colors flex items-center gap-3"
    >
      {dotColor && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium truncate tracking-[-0.01em]">
          {m.title ?? "Untitled meeting"}
        </div>
        <div className="font-mono text-[10.5px] text-paper-500 dark:text-paper-400 mt-1 tabular-nums uppercase tracking-[0.08em]">
          {progress ? (
            <>
              {progress.label} · {progress.pct}%
            </>
          ) : (
            <>
              {formatRelative(m.created_at)}
              {m.duration_sec != null &&
                ` · ${formatShortDuration(m.duration_sec)}`}
            </>
          )}
        </div>
        {progress && (
          <div className="mt-1.5 h-[3px] rounded-full bg-paper-200 dark:bg-paper-800 overflow-hidden">
            <div
              className="h-full bg-flame-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        )}
      </div>
      {chipStatus && <StatusChip status={chipStatus} />}
    </button>
  );
}

function toChipStatus(
  s: MeetingStatus
): "done" | "processing" | "failed" | "cancelled" | null {
  if (s === "done") return "done";
  if (s === "processing" || s === "pending") return "processing";
  if (s === "failed") return "failed";
  if (s === "cancelled") return "cancelled";
  return null;
}

function groupByRecency(rows: MeetingSummaryRow[]): Group[] {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const today: MeetingSummaryRow[] = [];
  const yesterday: MeetingSummaryRow[] = [];
  const earlier: MeetingSummaryRow[] = [];
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t >= todayStart) today.push(r);
    else if (t >= yesterdayStart) yesterday.push(r);
    else earlier.push(r);
  }
  return [
    { label: "Today", rows: today },
    { label: "Yesterday", rows: yesterday },
    { label: "Earlier", rows: earlier },
  ];
}
