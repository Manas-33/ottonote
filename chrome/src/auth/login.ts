import { config } from "../config";
import { saveSession, sessionFromTokens, type Session } from "./session";

export async function signInWithGoogle(): Promise<Session> {
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `${config.supabaseUrl}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectUri)}`;

  console.log("[ottonote] redirectUri:", redirectUri);
  console.log("[ottonote] authUrl:", authUrl);

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message ?? "OAuth cancelled"));
          return;
        }
        resolve(url);
      }
    );
  });

  const tokens = parseTokens(responseUrl);
  const session = sessionFromTokens(
    tokens.accessToken,
    tokens.refreshToken,
    tokens.expiresIn
  );
  await saveSession(session);
  return session;
}

function parseTokens(redirectUrl: string): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  const hash = new URL(redirectUrl).hash.slice(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in"));
  if (!accessToken || !refreshToken || !expiresIn) {
    throw new Error("OAuth response missing tokens");
  }
  return { accessToken, refreshToken, expiresIn };
}
