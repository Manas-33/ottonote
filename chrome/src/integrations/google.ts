/**
 * Google Calendar integration: OAuth2 + event creation.
 *
 * Uses chrome.identity.launchWebAuthFlow for the consent screen.
 * Tokens stored in chrome.storage.local via the shared oauth helpers.
 */

import { config } from "../config";
import {
  getToken,
  launchOAuth,
  redirectUri,
  removeToken,
  saveToken,
} from "./oauth";

const PROVIDER = "google";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

export async function connectGoogle(): Promise<void> {
  const clientId = config.googleClientId;
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID not configured");

  const redirect = redirectUri();
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&prompt=consent`;

  const responseUrl = await launchOAuth(authUrl);
  const hash = new URL(responseUrl).hash.slice(1);
  const params = new URLSearchParams(hash);

  const accessToken = params.get("access_token");
  const expiresIn = Number(params.get("expires_in") || "3600");
  if (!accessToken) throw new Error("Google OAuth: no access_token in response");

  await saveToken(PROVIDER, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });
}

export async function disconnectGoogle(): Promise<void> {
  const token = await getToken(PROVIDER);
  if (token) {
    // Best-effort revoke so the grant disappears from the user's Google account.
    fetch(
      `https://oauth2.googleapis.com/revoke?token=${token.accessToken}`,
      { method: "POST" }
    ).catch(() => {});
  }
  await removeToken(PROVIDER);
}

export async function isGoogleConnected(): Promise<boolean> {
  const t = await getToken(PROVIDER);
  return t != null;
}

async function getAccessToken(): Promise<string> {
  const t = await getToken(PROVIDER);
  if (!t) throw new Error("Google not connected");
  if (t.expiresAt && Date.now() > t.expiresAt - 60_000) {
    // Implicit grant has no refresh token — user must re-auth.
    await removeToken(PROVIDER);
    throw new Error("Google token expired — please reconnect");
  }
  return t.accessToken;
}

export type CalendarEventInput = {
  title: string;
  startDateTime: string; // ISO 8601
  endDateTime: string; // ISO 8601
  description?: string;
};

export async function createCalendarEvent(
  event: CalendarEventInput
): Promise<{ htmlLink: string }> {
  const token = await getAccessToken();
  const body = {
    summary: event.title,
    description: event.description ?? "",
    start: { dateTime: event.startDateTime },
    end: { dateTime: event.endDateTime },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return { htmlLink: data.htmlLink };
}
