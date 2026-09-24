import '../models/meeting.dart';
import 'format.dart';

/// Client-side Markdown export (mirrors the extension's lib/exports.ts idea —
/// there is no server export endpoint).
String meetingToMarkdown(Meeting m) {
  final b = StringBuffer();
  final title = (m.title?.trim().isNotEmpty ?? false) ? m.title!.trim() : 'Untitled meeting';
  b.writeln('# $title');
  b.writeln();
  b.writeln('${Fmt.dateWithTime(m.createdAt)} · ${Fmt.duration(m.durationSec)}'
      '${m.numSpeakers != null ? ' · ${m.numSpeakers} speakers' : ''}');
  b.writeln();

  final s = m.summary;
  if (s != null) {
    if (s.tldr != null && s.tldr!.trim().isNotEmpty) {
      b.writeln('**TL;DR** ${_stripMarks(s.tldr!)}');
      b.writeln();
    }
    if (s.summary.trim().isNotEmpty) {
      b.writeln('## Summary');
      b.writeln(s.summary.trim());
      b.writeln();
    }
    if (s.decisions.isNotEmpty) {
      b.writeln('## Decisions');
      for (final d in s.decisions) {
        b.writeln('- ${d.text}');
      }
      b.writeln();
    }
  }

  if (m.actionItems.isNotEmpty) {
    b.writeln('## Action items');
    for (final a in m.actionItems) {
      final who = a.assignee.trim().isNotEmpty ? '**${a.assignee}** — ' : '';
      final due = a.dueDate != null ? ' _(due ${a.dueDate})_' : '';
      b.writeln('- [${a.isDone ? 'x' : ' '}] $who${a.task}$due');
    }
    b.writeln();
  }

  if (s != null && s.followUps.isNotEmpty) {
    b.writeln('## Follow-ups');
    for (final f in s.followUps) {
      b.writeln('- $f');
    }
    b.writeln();
  }

  if (m.segments.isNotEmpty) {
    b.writeln('## Transcript');
    for (final seg in m.segments) {
      final who = m.speakerDisplayName(seg.speaker);
      b.writeln('**[${Fmt.clock(seg.startSec)}] $who:** ${seg.text}');
    }
  }
  return b.toString();
}

String _stripMarks(String s) =>
    s.replaceAll('<mark>', '').replaceAll('</mark>', '');
