/**
 * Notion integration: OAuth2, page search, structured page creation.
 *
 * Uses chrome.identity.launchWebAuthFlow for OAuth consent.
 * Notion's public integration OAuth returns a bearer token (no refresh).
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

const PROVIDER = "notion";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function connectNotion(): Promise<void> {
  const clientId = config.notionClientId;
  if (!clientId) throw new Error("VITE_NOTION_CLIENT_ID not configured");

  const redirect = redirectUri();
  const authUrl =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code` +
    `&owner=user`;

  const responseUrl = await launchOAuth(authUrl);
  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("Notion OAuth: no code in response");

  const clientSecret = config.notionClientSecret;
  if (!clientSecret) throw new Error("VITE_NOTION_CLIENT_SECRET not configured");

  const tokenRes = await fetch(`${NOTION_API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(clientId + ":" + clientSecret)}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
  });

  const data = await tokenRes.json();
  if (data.error) throw new Error(`Notion token exchange: ${data.error}`);

  await saveToken(PROVIDER, {
    accessToken: data.access_token,
    meta: {
      workspaceName: data.workspace_name ?? "",
      workspaceId: data.workspace_id ?? "",
    },
  });
}

export async function disconnectNotion(): Promise<void> {
  await removeToken(PROVIDER);
}

export async function isNotionConnected(): Promise<boolean> {
  const t = await getToken(PROVIDER);
  return t != null;
}

async function notionFetch(path: string, init: RequestInit = {}) {
  const t = await getToken(PROVIDER);
  if (!t) throw new Error("Notion not connected");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${t.accessToken}`);
  headers.set("Notion-Version", NOTION_VERSION);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${NOTION_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export type NotionPage = { id: string; title: string };

export async function searchPages(query?: string): Promise<NotionPage[]> {
  const body: Record<string, any> = {
    filter: { property: "object", value: "page" },
    page_size: 20,
  };
  if (query) body.query = query;

  const data = await notionFetch("/search", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (data.results ?? []).map((p: any) => ({
    id: p.id,
    title: extractTitle(p),
  }));
}

function extractTitle(page: any): string {
  const props = page.properties ?? {};
  for (const val of Object.values(props) as any[]) {
    if (val?.type === "title" && val.title?.length > 0) {
      return val.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function buildNotionBlocks(meeting: Meeting): any[] {
  const blocks: any[] = [];

  if (meeting.summary?.tldr) {
    const plain = meeting.summary.tldr.replace(/<\/?mark\s*>/gi, "");
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "💡" },
        rich_text: [{ type: "text", text: { content: plain } }],
      },
    });
  }

  if (meeting.summary?.summary) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "Summary" } }] },
    });
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { type: "text", text: { content: meeting.summary.summary } },
        ],
      },
    });
  }

  if (meeting.summary && meeting.summary.decisions.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Decisions" } }],
      },
    });
    for (const d of meeting.summary.decisions) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: d.text } }],
        },
      });
    }
  }

  if (meeting.action_items.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Action Items" } }],
      },
    });
    for (const a of meeting.action_items) {
      const due = a.due_date ? ` (due ${a.due_date})` : "";
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          checked: a.status === "done",
          rich_text: [
            {
              type: "text",
              text: { content: `${a.assignee}: ${a.task}${due}` },
            },
          ],
        },
      });
    }
  }

  if (meeting.calendar_events.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Calendar Events" } }],
      },
    });
    for (const c of meeting.calendar_events) {
      const desc = c.description ? `\n${c.description}` : "";
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: { content: `${c.title} — ${c.when_text}${desc}` },
            },
          ],
        },
      });
    }
  }

  if (meeting.summary && meeting.summary.follow_ups.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Follow-ups" } }],
      },
    });
    for (const f of meeting.summary.follow_ups) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: f } }],
        },
      });
    }
  }

  if (meeting.segments.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Transcript" } }],
      },
    });
    blocks.push({
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Full transcript (${meeting.segments.length} segments)`,
            },
          },
        ],
        children: meeting.segments.slice(0, 100).map((s) => ({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: `${s.speaker ?? "Unknown"}: ${s.text}`,
                },
                annotations: { bold: false },
              },
            ],
          },
        })),
      },
    });
  }

  return blocks;
}

export async function createMeetingPage(
  meeting: Meeting,
  parentPageId: string
): Promise<{ url: string }> {
  const title = meeting.title ?? "Untitled meeting";
  const blocks = buildNotionBlocks(meeting);

  const data = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title } }],
        },
      },
      children: blocks,
    }),
  });

  return { url: data.url };
}
