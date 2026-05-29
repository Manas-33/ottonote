/**
 * Slack integration: OAuth2, channel listing, message posting.
 *
 * Uses chrome.identity.launchWebAuthFlow for OAuth consent.
 * Tokens stored in chrome.storage.local via the shared oauth helpers.
 */

import { config } from "../config";
import type { Meeting } from "../api/meetings";
import {
  getToken,
  launchOAuth,
  redirectUri,
  removeToken,
  saveToken,
} from "./oauth";

const PROVIDER = "slack";
const SCOPES = "chat:write,channels:read,groups:read";

export async function connectSlack(): Promise<void> {
  const clientId = config.slackClientId;
  if (!clientId) throw new Error("VITE_SLACK_CLIENT_ID not configured");

  const redirect = redirectUri();
  const authUrl =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code`;

  const responseUrl = await launchOAuth(authUrl);
  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("Slack OAuth: no code in response");

  const clientSecret = config.slackClientSecret;
  if (!clientSecret) throw new Error("VITE_SLACK_CLIENT_SECRET not configured");

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirect,
    }),
  });

  const data = await tokenRes.json();
  if (!data.ok) throw new Error(`Slack token exchange failed: ${data.error}`);

  await saveToken(PROVIDER, {
    accessToken: data.access_token,
    meta: {
      teamName: data.team?.name ?? "",
      teamId: data.team?.id ?? "",
    },
  });
}

export async function disconnectSlack(): Promise<void> {
  await removeToken(PROVIDER);
}

export async function isSlackConnected(): Promise<boolean> {
  const t = await getToken(PROVIDER);
  return t != null;
}

async function getAccessToken(): Promise<string> {
  const t = await getToken(PROVIDER);
  if (!t) throw new Error("Slack not connected");
  return t.accessToken;
}

export type SlackChannel = { id: string; name: string };

export async function listChannels(): Promise<SlackChannel[]> {
  const token = await getAccessToken();
  const res = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack channels: ${data.error}`);
  return (data.channels ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
  }));
}

function formatSlackMessage(meeting: Meeting): string {
  const lines: string[] = [];
  const title = meeting.title ?? "Untitled meeting";
  lines.push(`*${title}*`);

  if (meeting.summary?.summary) {
    lines.push("");
    lines.push(meeting.summary.summary);
  }

  if (meeting.summary && meeting.summary.decisions.length > 0) {
    lines.push("");
    lines.push("*Decisions*");
    for (const d of meeting.summary.decisions) {
      lines.push(`• ${d.text}`);
    }
  }

  if (meeting.action_items.length > 0) {
    lines.push("");
    lines.push("*Action Items*");
    for (const a of meeting.action_items) {
      const check = a.status === "done" ? "~" : "";
      const due = a.due_date ? ` _(due ${a.due_date})_` : "";
      lines.push(
        `• ${check}*${a.assignee}:* ${a.task}${check}${due}`
      );
    }
  }

  if (meeting.calendar_events.length > 0) {
    lines.push("");
    lines.push("*Calendar Events*");
    for (const c of meeting.calendar_events) {
      lines.push(`• *${c.title}* — ${c.when_text}`);
    }
  }

  if (meeting.summary && meeting.summary.follow_ups.length > 0) {
    lines.push("");
    lines.push("*Follow-ups*");
    for (const f of meeting.summary.follow_ups) {
      lines.push(`• ${f}`);
    }
  }

  return lines.join("\n");
}

export async function postMeetingToSlack(
  meeting: Meeting,
  channelId: string
): Promise<{ permalink: string }> {
  const token = await getAccessToken();
  const text = formatSlackMessage(meeting);

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      unfurl_links: false,
    }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Slack post failed: ${data.error}`);
  return {
    permalink: `https://slack.com/archives/${channelId}/p${data.ts?.replace(".", "")}`,
  };
}
