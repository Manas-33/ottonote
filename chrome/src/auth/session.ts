import { config } from "../config";

const STORAGE_KEY = "ottonote/session";
const REFRESH_SKEW_MS = 60_000;

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string | null;
  userId: string;
};

type SupabaseTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id: string; email?: string | null };
};

export function sessionFromTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Session {
  const claims = decodeJwt(accessToken);
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    email: claims.email ?? null,
    userId: claims.sub,
  };
}

export async function loadSession(): Promise<Session | null> {
  const { [STORAGE_KEY]: s } = await chrome.storage.local.get(STORAGE_KEY);
  return (s as Session | undefined) ?? null;
}

export async function saveSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

export async function getFreshAccessToken(): Promise<string | null> {
  const session = await loadSession();
  if (!session) return null;
  if (Date.now() < session.expiresAt - REFRESH_SKEW_MS) {
    return session.accessToken;
  }
  const refreshed = await refresh(session.refreshToken);
  if (!refreshed) {
    await clearSession();
    return null;
  }
  await saveSession(refreshed);
  return refreshed.accessToken;
}

async function refresh(refreshToken: string): Promise<Session | null> {
  const res = await fetch(
    `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as SupabaseTokenResponse;
  return sessionFromTokens(
    data.access_token,
    data.refresh_token,
    data.expires_in
  );
}

function decodeJwt(token: string): { sub: string; email?: string } {
  const [, payload] = token.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}
