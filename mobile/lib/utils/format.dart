import 'package:intl/intl.dart';

/// Formatting helpers shared across screens (dates, durations, clock times).
class Fmt {
  const Fmt._();

  /// "Today · 14:32" / "Yesterday · 10:05" / "Mon · 09:30" / "5 Sep · 13:00".
  static String dateWithTime(DateTime dt) {
    final time = DateFormat.Hm().format(dt); // 24h, matches mockups
    return '${_relativeDay(dt)} · $time';
  }

  static String _relativeDay(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final that = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(that).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return DateFormat.E().format(dt); // Mon
    return DateFormat('d MMM').format(dt); // 5 Sep
  }

  /// "47m", "1h 05m", "—".
  static String duration(double? sec) {
    if (sec == null || sec <= 0) return '—';
    final total = sec.round();
    final h = total ~/ 3600;
    final m = (total % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m.toString().padLeft(2, '0')}m';
    if (m == 0) return '<1m';
    return '${m}m';
  }

  /// mm:ss, or h:mm:ss past an hour. Used for timestamps + source links.
  static String clock(double sec) {
    final total = sec.round();
    final h = total ~/ 3600;
    final m = (total % 3600) ~/ 60;
    final s = total % 60;
    final mm = m.toString().padLeft(2, '0');
    final ss = s.toString().padLeft(2, '0');
    return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
  }

  /// Elapsed HH:MM:SS for the recording timer.
  static ({String hh, String mm, String ss}) elapsedParts(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    return (
      hh: h.toString().padLeft(2, '0'),
      mm: m.toString().padLeft(2, '0'),
      ss: s.toString().padLeft(2, '0'),
    );
  }

  /// Wall-clock time, 24h (e.g. "14:32").
  static String clock24(DateTime dt) => DateFormat.Hm().format(dt);

  static String greeting([DateTime? now]) {
    final h = (now ?? DateTime.now()).hour;
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /// "Tue · 5 Sep · 12 meetings" style sub-header.
  static String todayLine(int meetingCount) {
    final now = DateTime.now();
    final d = DateFormat('E · d MMM').format(now);
    final noun = meetingCount == 1 ? 'meeting' : 'meetings';
    return '$d · $meetingCount $noun';
  }
}
