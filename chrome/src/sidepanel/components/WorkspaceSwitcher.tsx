import { useEffect, useRef, useState } from "react";
import {
  createWorkspace,
  deleteWorkspace,
  WORKSPACE_COLORS,
  type Workspace,
  type WorkspaceColor,
} from "../../api/workspaces";
import { Icon } from "../ui";
import { WORKSPACE_COLOR_CLASSES } from "../workspace";

export function WorkspaceSwitcher({
  workspaces,
  selectedId,
  onSelect,
  onMutated,
}: {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMutated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<WorkspaceColor>("blue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = workspaces.find((w) => w.id === selectedId) ?? null;
  const dotClass = selected
    ? WORKSPACE_COLOR_CLASSES[selected.color].dot
    : "bg-paper-300 dark:bg-paper-700";

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const ws = await createWorkspace(name, newColor);
      setNewName("");
      setNewColor("blue");
      setCreating(false);
      onMutated();
      onSelect(ws.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (w: Workspace) => {
    if (w.is_default) return;
    if (!confirm(`Delete "${w.name}"? Its meetings will move to Default.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWorkspace(w.id);
      if (selectedId === w.id) onSelect(null);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-paper-100 dark:hover:bg-paper-900 text-[11.5px] font-medium text-paper-700 dark:text-paper-200 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="truncate max-w-[100px]">
          {selected?.name ?? "All workspaces"}
        </span>
        <Icon name="chevron-down" size={12} className="opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-60 rounded-lg border border-paper-200 dark:border-paper-800 bg-paper-50 dark:bg-paper-900 shadow-lg z-20 py-1">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-paper-100 dark:hover:bg-paper-800 ${
              selectedId === null
                ? "text-paper-900 dark:text-paper-50 font-medium"
                : "text-paper-700 dark:text-paper-300"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-paper-300 dark:bg-paper-700" />
            All workspaces
            {selectedId === null && (
              <Icon name="check" size={12} className="ml-auto opacity-60" />
            )}
          </button>

          <div className="my-1 mx-2 h-px bg-paper-200 dark:bg-paper-800" />

          {workspaces.map((w) => {
            const cls = WORKSPACE_COLOR_CLASSES[w.color];
            const active = selectedId === w.id;
            return (
              <div
                key={w.id}
                className="group flex items-center hover:bg-paper-100 dark:hover:bg-paper-800"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(w.id);
                    setOpen(false);
                  }}
                  className={`flex-1 text-left px-3 py-1.5 text-[12px] flex items-center gap-2 min-w-0 ${
                    active
                      ? "text-paper-900 dark:text-paper-50 font-medium"
                      : "text-paper-700 dark:text-paper-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cls.dot}`} />
                  <span className="truncate">{w.name}</span>
                  {w.is_default && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-paper-400 dark:text-paper-500 ml-1">
                      default
                    </span>
                  )}
                  {active && (
                    <Icon name="check" size={12} className="ml-auto opacity-60 shrink-0" />
                  )}
                </button>
                {!w.is_default && (
                  <button
                    type="button"
                    onClick={() => handleDelete(w)}
                    disabled={busy}
                    aria-label={`Delete ${w.name}`}
                    className="opacity-0 group-hover:opacity-100 px-2 py-1.5 text-paper-400 hover:text-rose-600 dark:hover:text-rose-400 transition-opacity"
                  >
                    <Icon name="trash-2" size={11} />
                  </button>
                )}
              </div>
            );
          })}

          <div className="my-1 mx-2 h-px bg-paper-200 dark:bg-paper-800" />

          {creating ? (
            <div className="px-3 py-2 space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Workspace name"
                className="w-full px-2 py-1.5 text-[12px] rounded-md border border-paper-200 dark:border-paper-700 bg-paper-50 dark:bg-paper-950 text-paper-900 dark:text-paper-50 focus:outline-none focus:border-flame-500"
              />
              <div className="flex items-center gap-1.5">
                {WORKSPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={c}
                    className={`w-5 h-5 rounded-full ${
                      WORKSPACE_COLOR_CLASSES[c].dot
                    } ${
                      newColor === c
                        ? "ring-2 ring-offset-2 ring-paper-900 dark:ring-paper-50 ring-offset-paper-50 dark:ring-offset-paper-900"
                        : ""
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                  className="px-2 py-1 text-[11px] text-paper-600 dark:text-paper-400 hover:text-paper-900 dark:hover:text-paper-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy || !newName.trim()}
                  className="px-2 py-1 text-[11px] rounded bg-paper-900 dark:bg-paper-100 text-paper-50 dark:text-paper-900 font-medium disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 text-paper-700 dark:text-paper-300 hover:bg-paper-100 dark:hover:bg-paper-800"
            >
              <Icon name="plus" size={12} className="opacity-60" />
              New workspace
            </button>
          )}

          {error && (
            <p className="px-3 py-1 text-[10.5px] text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
