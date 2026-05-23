import { config } from "../config";
import { clearSession, getFreshAccessToken } from "../auth/session";

export class UnauthorizedError extends Error {}

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getFreshAccessToken();
  if (!token) throw new UnauthorizedError("Not signed in");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  if (res.status === 401) {
    await clearSession();
    throw new UnauthorizedError("Session expired");
  }
  return res;
}
