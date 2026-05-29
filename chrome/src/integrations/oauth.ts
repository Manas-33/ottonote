/**
 * Shared OAuth helpers for third-party integrations.
 *
 * Each integration stores its token under a namespaced key in
 * chrome.storage.local, following the same pattern as the Supabase session.
 */

const STORAGE_PREFIX = "ottonote/integration/";

export type IntegrationToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Integration-specific extras (e.g. Slack team name, Notion workspace). */
  meta?: Record<string, string>;
};

type StoredTokens = Record<string, IntegrationToken>;

async function readAll(): Promise<StoredTokens> {
  const key = STORAGE_PREFIX + "tokens";
  const { [key]: stored } = await chrome.storage.local.get(key);
  return (stored as StoredTokens | undefined) ?? {};
}

async function writeAll(tokens: StoredTokens): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_PREFIX + "tokens"]: tokens });
}

export async function getToken(
  provider: string
): Promise<IntegrationToken | null> {
  const all = await readAll();
  return all[provider] ?? null;
}

export async function saveToken(
  provider: string,
  token: IntegrationToken
): Promise<void> {
  const all = await readAll();
  all[provider] = token;
  await writeAll(all);
}

export async function removeToken(provider: string): Promise<void> {
  const all = await readAll();
  delete all[provider];
  await writeAll(all);
}

export async function isConnected(provider: string): Promise<boolean> {
  const t = await getToken(provider);
  return t != null;
}

/**
 * Launch Chrome's identity OAuth flow and return the redirect URL.
 * The caller parses the URL for tokens/codes.
 */
export async function launchOAuth(authUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(
            new Error(chrome.runtime.lastError?.message ?? "OAuth cancelled")
          );
          return;
        }
        resolve(url);
      }
    );
  });
}

/** The stable redirect URI for this extension (derived from the manifest key). */
export function redirectUri(): string {
  return chrome.identity.getRedirectURL();
}
