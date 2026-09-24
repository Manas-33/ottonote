// Dart models mirroring the JSON wire shapes served by the FastAPI backend
// (chrome/src/api/meetings.ts is the source of truth for these). Field names
// match the JSON exactly; we expose camelCase Dart getters.

int _asInt(dynamic v, [int fallback = 0]) =>
    v is int ? v : (v is num ? v.toInt() : (v == null ? fallback : int.tryParse('$v') ?? fallback));

double? _asDoubleOrNull(dynamic v) =>
    v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

double _asDouble(dynamic v, [double fallback = 0]) => _asDoubleOrNull(v) ?? fallback;

List<int> _asIntList(dynamic v) =>
    (v is List) ? v.map((e) => _asInt(e)).toList() : const [];

enum MeetingStatus {
  pending,
  processing,
  done,
  failed,
  cancelled;

  static MeetingStatus fromWire(String? s) {
    switch (s) {
      case 'processing':
        return MeetingStatus.processing;
      case 'done':
        return MeetingStatus.done;
      case 'failed':
        return MeetingStatus.failed;
      case 'cancelled':
        return MeetingStatus.cancelled;
      case 'pending':
      default:
        return MeetingStatus.pending;
    }
  }

  bool get isTerminal =>
      this == done || this == failed || this == cancelled;
  bool get isActive => this == pending || this == processing;
}

/// Ordered pipeline stages the client polls for. Order matters — used to derive
/// overall progress percent (see [ProgressStepX]).
enum ProgressStep {
  normalizing,
  transcribing,
  diarizing,
  summarizing,
  verifying,
  resolving,
  finalizing;

  static ProgressStep? fromWire(String? s) {
    if (s == null) return null;
    for (final v in ProgressStep.values) {
      if (v.name == s) return v;
    }
    return null;
  }
}

extension ProgressStepX on ProgressStep? {
  /// Percent map mirrors chrome/src/format.ts `progressInfo`.
  int get percent {
    switch (this) {
      case ProgressStep.normalizing:
        return 10;
      case ProgressStep.transcribing:
        return 30;
      case ProgressStep.diarizing:
        return 55;
      case ProgressStep.summarizing:
        return 75;
      case ProgressStep.verifying:
        return 85;
      case ProgressStep.resolving:
        return 93;
      case ProgressStep.finalizing:
        return 98;
      case null:
        return 5; // queued
    }
  }

  String get label {
    switch (this) {
      case ProgressStep.normalizing:
        return 'Normalizing audio';
      case ProgressStep.transcribing:
        return 'Transcribing';
      case ProgressStep.diarizing:
        return 'Diarizing speakers';
      case ProgressStep.summarizing:
        return 'Summarizing';
      case ProgressStep.verifying:
        return 'Verifying claims';
      case ProgressStep.resolving:
        return 'Resolving references';
      case ProgressStep.finalizing:
        return 'Finalizing';
      case null:
        return 'Queued';
    }
  }
}

class Segment {
  final int idx;
  final double startSec;
  final double endSec;
  final String? speaker; // raw diarizer label e.g. "SPEAKER_00" or null
  final String text;

  const Segment({
    required this.idx,
    required this.startSec,
    required this.endSec,
    required this.speaker,
    required this.text,
  });

  factory Segment.fromJson(Map<String, dynamic> j) => Segment(
        idx: _asInt(j['idx']),
        startSec: _asDouble(j['start_sec']),
        endSec: _asDouble(j['end_sec']),
        speaker: j['speaker'] as String?,
        text: (j['text'] as String?) ?? '',
      );
}

class Decision {
  final String text;
  final List<int> sourceSegmentIndices;
  final double confidence;
  final bool? verified;

  const Decision({
    required this.text,
    required this.sourceSegmentIndices,
    required this.confidence,
    required this.verified,
  });

  factory Decision.fromJson(Map<String, dynamic> j) => Decision(
        text: (j['text'] as String?) ?? '',
        sourceSegmentIndices: _asIntList(j['source_segment_indices']),
        confidence: _asDouble(j['confidence'], 1.0),
        verified: j['verified'] as bool?,
      );

  Trust get trust => Trust.of(confidence: confidence, verified: verified);
}

class ActionItem {
  final String id;
  final String assignee; // free-text responsible person
  final String task;
  final String? dueDate; // free text OR ISO date
  final String status; // "open" | "done"
  final String? speakerLabel; // diarized speaker who voiced it
  final List<int> sourceSegmentIndices;
  final double confidence;
  final bool? verified;

  const ActionItem({
    required this.id,
    required this.assignee,
    required this.task,
    required this.dueDate,
    required this.status,
    required this.speakerLabel,
    required this.sourceSegmentIndices,
    required this.confidence,
    required this.verified,
  });

  bool get isDone => status == 'done';

  ActionItem copyWith({String? status}) => ActionItem(
        id: id,
        assignee: assignee,
        task: task,
        dueDate: dueDate,
        status: status ?? this.status,
        speakerLabel: speakerLabel,
        sourceSegmentIndices: sourceSegmentIndices,
        confidence: confidence,
        verified: verified,
      );

  factory ActionItem.fromJson(Map<String, dynamic> j) => ActionItem(
        id: '${j['id']}',
        assignee: (j['assignee'] as String?) ?? '',
        task: (j['task'] as String?) ?? '',
        dueDate: j['due_date'] as String?,
        status: (j['status'] as String?) ?? 'open',
        speakerLabel: j['speaker_label'] as String?,
        sourceSegmentIndices: _asIntList(j['source_segment_indices']),
        confidence: _asDouble(j['confidence'], 1.0),
        verified: j['verified'] as bool?,
      );

  Trust get trust => Trust.of(confidence: confidence, verified: verified);
}

class CalendarEvent {
  final String id;
  final String title;
  final String whenText; // natural language, e.g. "next Friday at 2pm"
  final String? description;
  final List<int> sourceSegmentIndices;
  final double confidence;
  final bool? verified;

  const CalendarEvent({
    required this.id,
    required this.title,
    required this.whenText,
    required this.description,
    required this.sourceSegmentIndices,
    required this.confidence,
    required this.verified,
  });

  factory CalendarEvent.fromJson(Map<String, dynamic> j) => CalendarEvent(
        id: '${j['id']}',
        title: (j['title'] as String?) ?? '',
        whenText: (j['when_text'] as String?) ?? '',
        description: j['description'] as String?,
        sourceSegmentIndices: _asIntList(j['source_segment_indices']),
        confidence: _asDouble(j['confidence'], 1.0),
        verified: j['verified'] as bool?,
      );

  Trust get trust => Trust.of(confidence: confidence, verified: verified);
}

class Summary {
  final String? tldr; // may contain literal <mark>…</mark> tags
  final String summary;
  final List<Decision> decisions;
  final Map<String, List<String>> keywords; // category -> keywords
  final List<String> followUps;

  const Summary({
    required this.tldr,
    required this.summary,
    required this.decisions,
    required this.keywords,
    required this.followUps,
  });

  /// Flattened keyword list (design renders a single chip row).
  List<String> get allKeywords =>
      keywords.values.expand((e) => e).toList(growable: false);

  factory Summary.fromJson(Map<String, dynamic> j) {
    final kw = <String, List<String>>{};
    final rawKw = j['keywords'];
    if (rawKw is Map) {
      rawKw.forEach((k, v) {
        kw['$k'] = (v is List) ? v.map((e) => '$e').toList() : <String>[];
      });
    }
    return Summary(
      tldr: j['tldr'] as String?,
      summary: (j['summary'] as String?) ?? '',
      decisions: ((j['decisions'] as List?) ?? const [])
          .map((e) => Decision.fromJson(e as Map<String, dynamic>))
          .toList(),
      keywords: kw,
      followUps: ((j['follow_ups'] as List?) ?? const [])
          .map((e) => '$e')
          .toList(),
    );
  }
}

/// The lightweight row returned by GET /meetings (list view).
class MeetingSummary {
  final String id;
  final String? title;
  final MeetingStatus status;
  final ProgressStep? progressStep;
  final double? durationSec;
  final String? language;
  final int? numSpeakers;
  final String? workspaceId;
  final DateTime createdAt;

  const MeetingSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.progressStep,
    required this.durationSec,
    required this.language,
    required this.numSpeakers,
    required this.workspaceId,
    required this.createdAt,
  });

  factory MeetingSummary.fromJson(Map<String, dynamic> j) => MeetingSummary(
        id: '${j['id']}',
        title: j['title'] as String?,
        status: MeetingStatus.fromWire(j['status'] as String?),
        progressStep: ProgressStep.fromWire(j['progress_step'] as String?),
        durationSec: _asDoubleOrNull(j['duration_sec']),
        language: j['language'] as String?,
        numSpeakers: j['num_speakers'] as int?,
        workspaceId: j['workspace_id'] as String?,
        createdAt:
            DateTime.tryParse('${j['created_at']}')?.toLocal() ?? DateTime.now(),
      );
}

/// Full meeting detail (GET /meetings/{id}).
class Meeting {
  final String id;
  final String? title;
  final MeetingStatus status;
  final ProgressStep? progressStep;
  final String? taskId;
  final String? errorMessage;
  final double? durationSec;
  final String? language;
  final int? numSpeakers;
  final String? workspaceId;
  final DateTime createdAt;
  final List<Segment> segments;
  final Summary? summary;
  final List<ActionItem> actionItems;
  final List<CalendarEvent> calendarEvents;
  final Map<String, String> speakerNames; // e.g. {"SPEAKER_00": "Sarah"}

  const Meeting({
    required this.id,
    required this.title,
    required this.status,
    required this.progressStep,
    required this.taskId,
    required this.errorMessage,
    required this.durationSec,
    required this.language,
    required this.numSpeakers,
    required this.workspaceId,
    required this.createdAt,
    required this.segments,
    required this.summary,
    required this.actionItems,
    required this.calendarEvents,
    required this.speakerNames,
  });

  Meeting copyWith({
    String? title,
    String? workspaceId,
    bool clearWorkspace = false,
    List<ActionItem>? actionItems,
    Map<String, String>? speakerNames,
  }) =>
      Meeting(
        id: id,
        title: title ?? this.title,
        status: status,
        progressStep: progressStep,
        taskId: taskId,
        errorMessage: errorMessage,
        durationSec: durationSec,
        language: language,
        numSpeakers: numSpeakers,
        workspaceId: clearWorkspace ? null : (workspaceId ?? this.workspaceId),
        createdAt: createdAt,
        segments: segments,
        summary: summary,
        actionItems: actionItems ?? this.actionItems,
        calendarEvents: calendarEvents,
        speakerNames: speakerNames ?? this.speakerNames,
      );

  factory Meeting.fromJson(Map<String, dynamic> j) {
    final names = <String, String>{};
    final rawNames = j['speaker_names'];
    if (rawNames is Map) {
      rawNames.forEach((k, v) => names['$k'] = '$v');
    }
    return Meeting(
      id: '${j['id']}',
      title: j['title'] as String?,
      status: MeetingStatus.fromWire(j['status'] as String?),
      progressStep: ProgressStep.fromWire(j['progress_step'] as String?),
      taskId: j['task_id'] as String?,
      errorMessage: j['error_message'] as String?,
      durationSec: _asDoubleOrNull(j['duration_sec']),
      language: j['language'] as String?,
      numSpeakers: j['num_speakers'] as int?,
      workspaceId: j['workspace_id'] as String?,
      createdAt:
          DateTime.tryParse('${j['created_at']}')?.toLocal() ?? DateTime.now(),
      segments: ((j['segments'] as List?) ?? const [])
          .map((e) => Segment.fromJson(e as Map<String, dynamic>))
          .toList(),
      summary: j['summary'] == null
          ? null
          : Summary.fromJson(j['summary'] as Map<String, dynamic>),
      actionItems: ((j['action_items'] as List?) ?? const [])
          .map((e) => ActionItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      calendarEvents: ((j['calendar_events'] as List?) ?? const [])
          .map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>))
          .toList(),
      speakerNames: names,
    );
  }

  /// Resolve a raw diarizer label to its display name (rename override, else a
  /// friendly "Speaker N", else "Unknown"). Mirrors the extension.
  String speakerDisplayName(String? label) {
    if (label == null || label.isEmpty) return 'Unknown';
    final override = speakerNames[label];
    if (override != null && override.trim().isNotEmpty) return override;
    final m = RegExp(r'(\d+)$').firstMatch(label);
    if (m != null) return 'Speaker ${int.parse(m.group(1)!) + 1}';
    return label;
  }
}

/// Trust classification shared by decisions, action items and calendar events.
///
/// Mirrors the extension's ConfidenceBadge logic:
///   verified == true                    -> verified (green "VERIFIED")
///   verified == false                   -> flagged  (red "FLAGGED")
///   verified == null & confidence >= .8 -> high     (green %)
///   verified == null & confidence <  .8 -> review/flagged by % (amber, red < .5)
enum TrustKind { verified, high, review, flagged }

class Trust {
  final TrustKind kind;
  final int? pct; // present for high/review

  const Trust._(this.kind, this.pct);

  static const double threshold = 0.8; // summarize.py CONFIDENCE_THRESHOLD

  factory Trust.of({required double confidence, required bool? verified}) {
    if (verified == true) return const Trust._(TrustKind.verified, null);
    if (verified == false) return const Trust._(TrustKind.flagged, null);
    final pct = (confidence * 100).round();
    if (confidence >= threshold) return Trust._(TrustKind.high, pct);
    if (confidence < 0.5) return Trust._(TrustKind.flagged, pct);
    return Trust._(TrustKind.review, pct);
  }
}
