// Workspace selection state shared across screens.
//
// "Selected" represents the workspace the Library is currently filtered to.
// `null` means "All workspaces". A new recording uses the selected workspace
// as its target; if "All" is selected, we fall through to the user's default
// (server-side).

import { useEffect, useState } from "react";
import {
  listWorkspaces,
  type Workspace,
  type WorkspaceColor,
} from "../api/workspaces";

const SELECTED_KEY = "ottonote/selected-workspace";

export function getSelectedWorkspaceId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function setSelectedWorkspaceId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(SELECTED_KEY);
    else localStorage.setItem(SELECTED_KEY, id);
  } catch {
    /* storage unavailable — selection only lasts this session */
  }
  channel.postMessage({ id });
}

const channel = new BroadcastChannel("ottonote-workspace");

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(() =>
    getSelectedWorkspaceId()
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const rows = await listWorkspaces();
      setWorkspaces(rows);
      setError(null);
      // Drop stale selection (workspace was deleted elsewhere).
      const current = getSelectedWorkspaceId();
      if (current && !rows.some((w) => w.id === current)) {
        setSelectedIdState(null);
        setSelectedWorkspaceId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    refresh();
    const onChange = (e: MessageEvent) => {
      setSelectedIdState(e.data?.id ?? null);
    };
    channel.addEventListener("message", onChange);
    return () => channel.removeEventListener("message", onChange);
  }, []);

  const setSelected = (id: string | null) => {
    setSelectedIdState(id);
    setSelectedWorkspaceId(id);
  };

  return { workspaces, selectedId, setSelected, refresh, error };
}

// Tailwind class fragments for each preset. Tailwind needs literal strings to
// generate utilities at build time, so we list them explicitly.
export const WORKSPACE_COLOR_CLASSES: Record<
  WorkspaceColor,
  { dot: string; chip: string; chipText: string }
> = {
  slate: {
    dot: "bg-paper-400 dark:bg-paper-500",
    chip: "bg-paper-200 dark:bg-paper-800",
    chipText: "text-paper-700 dark:text-paper-200",
  },
  blue: {
    dot: "bg-blue-500",
    chip: "bg-blue-100 dark:bg-blue-900/40",
    chipText: "text-blue-800 dark:text-blue-300",
  },
  emerald: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 dark:bg-emerald-900/40",
    chipText: "text-emerald-800 dark:text-emerald-300",
  },
  amber: {
    dot: "bg-amber-500",
    chip: "bg-amber-100 dark:bg-amber-900/40",
    chipText: "text-amber-800 dark:text-amber-300",
  },
  rose: {
    dot: "bg-rose-500",
    chip: "bg-rose-100 dark:bg-rose-900/40",
    chipText: "text-rose-800 dark:text-rose-300",
  },
  violet: {
    dot: "bg-violet-500",
    chip: "bg-violet-100 dark:bg-violet-900/40",
    chipText: "text-violet-800 dark:text-violet-300",
  },
};
