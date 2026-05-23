import type { Meeting } from "../api/meetings";

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}

export function toMarkdown(meeting: Meeting): string {
  const lines: string[] = [];
  lines.push(`# ${meeting.title ?? "Untitled meeting"}`);
  lines.push("");

  const meta: string[] = [];
  if (meeting.duration_sec != null)
    meta.push(`**Duration:** ${formatDuration(meeting.duration_sec)}`);
  if (meeting.language) meta.push(`**Language:** ${meeting.language}`);
  if (meeting.num_speakers != null)
    meta.push(`**Speakers:** ${meeting.num_speakers}`);
  meta.push(`**Date:** ${new Date(meeting.created_at).toLocaleString()}`);
  lines.push(meta.join(" · "));
  lines.push("");

  if (meeting.summary?.summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(meeting.summary.summary);
    lines.push("");
  }

  if (meeting.summary && meeting.summary.decisions.length > 0) {
    lines.push("## Decisions");
    lines.push("");
    for (const d of meeting.summary.decisions) lines.push(`- ${d}`);
    lines.push("");
  }

  if (meeting.action_items.length > 0) {
    lines.push("## Action items");
    lines.push("");
    for (const a of meeting.action_items) {
      const check = a.status === "done" ? "x" : " ";
      const due = a.due_date ? ` _(due ${a.due_date})_` : "";
      lines.push(`- [${check}] **${a.assignee}:** ${a.task}${due}`);
    }
    lines.push("");
  }

  if (meeting.summary && meeting.summary.follow_ups.length > 0) {
    lines.push("## Follow-ups");
    lines.push("");
    for (const f of meeting.summary.follow_ups) lines.push(`- ${f}`);
    lines.push("");
  }

  if (meeting.summary && Object.keys(meeting.summary.keywords).length > 0) {
    lines.push("## Keywords");
    lines.push("");
    for (const [category, words] of Object.entries(meeting.summary.keywords)) {
      lines.push(`- **${category}:** ${words.join(", ")}`);
    }
    lines.push("");
  }

  if (meeting.calendar_events.length > 0) {
    lines.push("## Calendar events");
    lines.push("");
    for (const c of meeting.calendar_events) {
      lines.push(`- **${c.title}** — ${c.when_text}`);
      if (c.description) lines.push(`  ${c.description}`);
    }
    lines.push("");
  }

  if (meeting.segments.length > 0) {
    lines.push("## Transcript");
    lines.push("");
    for (const s of meeting.segments) {
      const speaker = s.speaker ?? "Unknown";
      lines.push(`**${speaker}** _(${formatDuration(s.start_sec)})_  `);
      lines.push(s.text);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toPrintableHtml(meeting: Meeting): string {
  const title = escapeHtml(meeting.title ?? "Untitled meeting");

  const meta: string[] = [];
  if (meeting.duration_sec != null)
    meta.push(`Duration: ${formatDuration(meeting.duration_sec)}`);
  if (meeting.language) meta.push(`Language: ${escapeHtml(meeting.language)}`);
  if (meeting.num_speakers != null)
    meta.push(`Speakers: ${meeting.num_speakers}`);
  meta.push(`Date: ${new Date(meeting.created_at).toLocaleString()}`);

  const summary = meeting.summary?.summary
    ? `<section><h2>Summary</h2><p>${escapeHtml(meeting.summary.summary)}</p></section>`
    : "";

  const decisions =
    meeting.summary && meeting.summary.decisions.length > 0
      ? `<section><h2>Decisions</h2><ul>${meeting.summary.decisions
          .map((d) => `<li>${escapeHtml(d)}</li>`)
          .join("")}</ul></section>`
      : "";

  const actions =
    meeting.action_items.length > 0
      ? `<section><h2>Action items</h2><ul>${meeting.action_items
          .map((a) => {
            const check = a.status === "done" ? "☑" : "☐";
            const due = a.due_date ? ` <em>(due ${escapeHtml(a.due_date)})</em>` : "";
            return `<li>${check} <strong>${escapeHtml(a.assignee)}:</strong> ${escapeHtml(a.task)}${due}</li>`;
          })
          .join("")}</ul></section>`
      : "";

  const followUps =
    meeting.summary && meeting.summary.follow_ups.length > 0
      ? `<section><h2>Follow-ups</h2><ul>${meeting.summary.follow_ups
          .map((f) => `<li>${escapeHtml(f)}</li>`)
          .join("")}</ul></section>`
      : "";

  const keywords =
    meeting.summary && Object.keys(meeting.summary.keywords).length > 0
      ? `<section><h2>Keywords</h2><ul>${Object.entries(meeting.summary.keywords)
          .map(
            ([cat, words]) =>
              `<li><strong>${escapeHtml(cat)}:</strong> ${words
                .map((w) => escapeHtml(w))
                .join(", ")}</li>`
          )
          .join("")}</ul></section>`
      : "";

  const events =
    meeting.calendar_events.length > 0
      ? `<section><h2>Calendar events</h2><ul>${meeting.calendar_events
          .map(
            (c) =>
              `<li><strong>${escapeHtml(c.title)}</strong> — ${escapeHtml(c.when_text)}${
                c.description ? `<br><em>${escapeHtml(c.description)}</em>` : ""
              }</li>`
          )
          .join("")}</ul></section>`
      : "";

  const transcript =
    meeting.segments.length > 0
      ? `<section><h2>Transcript</h2>${meeting.segments
          .map(
            (s) =>
              `<div class="turn"><div class="speaker">${escapeHtml(
                s.speaker ?? "Unknown"
              )} <span class="ts">${formatDuration(s.start_sec)}</span></div><div>${escapeHtml(s.text)}</div></div>`
          )
          .join("")}</section>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.5; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-top: 32px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  section p { margin: 0 0 12px; }
  .turn { margin: 10px 0; padding: 6px 0; border-top: 1px solid #f0f0f0; }
  .turn:first-of-type { border-top: 0; }
  .speaker { font-size: 12px; font-weight: 600; color: #444; margin-bottom: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .ts { color: #999; font-weight: 400; }
  @media print {
    body { margin: 0; max-width: none; }
    h2 { page-break-after: avoid; }
    .turn, li, section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${meta.map((m) => escapeHtml(m)).join(" · ")}</div>
  ${summary}${decisions}${actions}${followUps}${keywords}${events}${transcript}
</body>
</html>`;
}

export async function downloadMarkdown(meeting: Meeting) {
  const md = toMarkdown(meeting);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `${safeFilename(meeting.title ?? "meeting")}.md`,
      saveAs: false,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function openPrintable(meeting: Meeting) {
  const html = toPrintableHtml(meeting);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");

  if (win) {
    // Call print() from this (same-origin) window so we don't need an inline
    // script in the printable HTML, which the extension CSP blocks. Poll
    // readyState because cross-window 'load' is racy and might fire before
    // we can attach a listener.
    const start = Date.now();
    const tryPrint = () => {
      try {
        if (win.closed) return;
        if (win.document.readyState === "complete") {
          win.focus();
          win.print();
          return;
        }
      } catch {
        // Origin not yet settled — keep polling briefly.
      }
      if (Date.now() - start < 5000) {
        setTimeout(tryPrint, 100);
      }
    };
    setTimeout(tryPrint, 50);
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
