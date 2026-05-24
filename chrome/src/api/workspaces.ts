import { apiFetch } from "./client";

export const WORKSPACE_COLORS = [
  "slate",
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
] as const;
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export type Workspace = {
  id: string;
  name: string;
  color: WorkspaceColor;
  is_default: boolean;
  created_at: string;
};

async function jsonOrThrow<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await apiFetch("/workspaces");
  return jsonOrThrow<Workspace[]>(res, "List workspaces");
}

export async function createWorkspace(
  name: string,
  color: WorkspaceColor = "slate"
): Promise<Workspace> {
  const res = await apiFetch("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  return jsonOrThrow<Workspace>(res, "Create workspace");
}

export async function updateWorkspace(
  id: string,
  patch: { name?: string; color?: WorkspaceColor }
): Promise<Workspace> {
  const res = await apiFetch(`/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<Workspace>(res, "Update workspace");
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await apiFetch(`/workspaces/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Delete workspace failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}
