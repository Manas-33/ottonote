import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import '../models/meeting.dart';
import '../providers/core_providers.dart';
import '../providers/meetings_providers.dart';
import '../providers/workspace_providers.dart';
import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../utils/export_markdown.dart';
import '../utils/format.dart';
import '../widgets/app_icons.dart';
import '../widgets/audio_player_bar.dart';
import '../widgets/section_rule.dart';
import '../widgets/source_link.dart';
import '../widgets/status_chip.dart';
import '../widgets/trust_badge.dart';
import 'sheets/share_sheet.dart';

const _speakerColors = [
  Flame.f500,
  Accent.sky500,
  Accent.emerald500,
  Accent.violet500,
  Accent.amber500,
  Accent.rose500,
];
const _speedCycle = [1.0, 1.25, 1.5, 2.0];

/// 05 · Meeting detail. Trust-first: TL;DR, summary, decisions, action items —
/// each with a confidence/verified badge + source-jump — transcript with
/// tappable speaker rename + segment seek, and a docked audio player.
class MeetingDetailScreen extends ConsumerStatefulWidget {
  final String meetingId;
  const MeetingDetailScreen({super.key, required this.meetingId});

  @override
  ConsumerState<MeetingDetailScreen> createState() =>
      _MeetingDetailScreenState();
}

class _MeetingDetailScreenState extends ConsumerState<MeetingDetailScreen> {
  final _scroll = ScrollController();
  final _segmentKeys = <int, GlobalKey>{};
  final _transcriptKey = GlobalKey();

  AudioPlayer? _player;
  bool _audioRequested = false;
  bool _audioReady = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _playing = false;
  int _speedIdx = 0;

  bool _searchOpen = false;
  String _query = '';
  bool _expandTranscript = false;

  static const _transcriptCap = 40;

  @override
  void dispose() {
    _player?.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadAudio() async {
    if (_audioRequested) return;
    _audioRequested = true;
    try {
      final res = await ref.read(meetingsApiProvider).getAudioUrl(widget.meetingId);
      final player = AudioPlayer();
      await player.setUrl(res.url);
      player.positionStream.listen((p) {
        if (mounted) setState(() => _position = p);
      });
      player.durationStream.listen((d) {
        if (mounted && d != null) setState(() => _duration = d);
      });
      player.playerStateStream.listen((s) {
        if (mounted) setState(() => _playing = s.playing);
      });
      if (mounted) {
        setState(() {
          _player = player;
          _audioReady = true;
        });
      }
    } catch (_) {
      // Audio is optional; the notes remain usable without playback.
    }
  }

  void _togglePlay() {
    final p = _player;
    if (p == null) return;
    if (p.playing) {
      p.pause();
    } else {
      if (p.processingState == ProcessingState.completed) {
        p.seek(Duration.zero);
      }
      p.play();
    }
  }

  void _cycleSpeed() {
    setState(() => _speedIdx = (_speedIdx + 1) % _speedCycle.length);
    _player?.setSpeed(_speedCycle[_speedIdx]);
  }

  Future<void> _seekToSegment(int idx, List<Segment> segments) async {
    Segment? seg;
    for (final s in segments) {
      if (s.idx == idx) {
        seg = s;
        break;
      }
    }
    if (seg == null) return;
    _player?.seek(Duration(milliseconds: (seg.startSec * 1000).round()));
    if (_player != null && !_player!.playing) _player!.play();
  }

  Future<void> _jumpToSource(List<int> indices, List<Segment> segments) async {
    if (indices.isEmpty) return;
    final first = indices.first;
    await _seekToSegment(first, segments);
    if (!mounted) return;
    final key = _segmentKeys[first] ?? _transcriptKey;
    final ctx = key.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx,
          duration: const Duration(milliseconds: 400),
          alignment: 0.1,
          curve: Curves.easeInOut);
    } else {
      final tctx = _transcriptKey.currentContext;
      if (tctx != null) {
        Scrollable.ensureVisible(tctx,
            duration: const Duration(milliseconds: 400), alignment: 0.05);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final async = ref.watch(meetingDetailProvider(widget.meetingId));

    return Scaffold(
      backgroundColor: c.bg,
      body: async.when(
        loading: () =>
            const SafeArea(child: Center(child: CircularProgressIndicator())),
        error: (e, _) => _errorScaffold(c, e),
        data: (m) {
          if (m.status == MeetingStatus.done && !_audioRequested) {
            WidgetsBinding.instance.addPostFrameCallback((_) => _loadAudio());
          }
          return SafeArea(
            bottom: false,
            child: Column(
              children: [
                _Header(
                  meeting: m,
                  onBack: () => Navigator.of(context).maybePop(),
                  onRename: () => _renameTitle(m),
                  onShare: () => showShareSheet(context,
                      meetingTitle: _titleOf(m)),
                  onDownload: () => _exportMarkdown(m),
                  onMore: () => _moreMenu(m),
                ),
                Expanded(child: _bodyFor(c, m)),
                if (m.status == MeetingStatus.done)
                  AudioPlayerBar(
                    playing: _playing,
                    position: _position,
                    duration: _duration,
                    speed: _speedCycle[_speedIdx],
                    enabled: _audioReady,
                    onToggle: _togglePlay,
                    onCycleSpeed: _cycleSpeed,
                    onSeekFraction: (f) {
                      if (_duration.inMilliseconds > 0) {
                        _player?.seek(Duration(
                            milliseconds:
                                (_duration.inMilliseconds * f).round()));
                      }
                    },
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _bodyFor(OttoColors c, Meeting m) {
    switch (m.status) {
      case MeetingStatus.done:
        return _content(c, m);
      case MeetingStatus.failed:
        return _stateView(c, m,
            icon: AppIcons.alertTriangle,
            title: 'Processing failed',
            message: m.errorMessage ?? 'Something went wrong.',
            showRetry: true);
      case MeetingStatus.cancelled:
        return _stateView(c, m,
            icon: AppIcons.x,
            title: 'Recording cancelled',
            message: 'This recording was cancelled before processing finished.',
            showRetry: true);
      case MeetingStatus.pending:
      case MeetingStatus.processing:
        return _processingView(c, m);
    }
  }

  // ---------------- DONE content ----------------

  Widget _content(OttoColors c, Meeting m) {
    final segments = m.segments;
    final byIdxTime = <int, double>{
      for (final s in segments) s.idx: s.startSec,
    };
    final speakerColor = _speakerColorMap(m);

    return ListView(
      controller: _scroll,
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (m.summary?.tldr != null && m.summary!.tldr!.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: _TldrCard(tldr: m.summary!.tldr!),
          ),
        if (m.summary != null && m.summary!.summary.trim().isNotEmpty)
          _section(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionRule(
                  index: '01',
                  label: 'Summary',
                  trailing: TrustBadge.fromTrust(_rollupTrust(m), small: true),
                ),
                Text(m.summary!.summary.trim(),
                    style: TextStyle(
                        fontSize: 14, height: 1.6, color: c.textBody)),
              ],
            ),
          ),
        if (m.summary != null && m.summary!.decisions.isNotEmpty)
          _section(
            child: _Decisions(
              decisions: m.summary!.decisions,
              timeByIdx: byIdxTime,
              onSource: (idxs) => _jumpToSource(idxs, segments),
            ),
          ),
        if (m.actionItems.isNotEmpty)
          _section(
            child: _ActionItems(
              meetingId: widget.meetingId,
              items: m.actionItems,
              timeByIdx: byIdxTime,
              onSource: (idxs) => _jumpToSource(idxs, segments),
            ),
          ),
        if (segments.isNotEmpty)
          _section(
            key: _transcriptKey,
            child: _Transcript(
              meeting: m,
              speakerColor: speakerColor,
              segmentKeys: _segmentKeys,
              searchOpen: _searchOpen,
              query: _query,
              expanded: _expandTranscript,
              cap: _transcriptCap,
              onToggleSearch: () => setState(() {
                _searchOpen = !_searchOpen;
                if (!_searchOpen) _query = '';
              }),
              onQuery: (q) => setState(() => _query = q),
              onExpand: () => setState(() => _expandTranscript = true),
              onSeek: (idx) => _seekToSegment(idx, segments),
              onRenameSpeaker: (label) => _renameSpeaker(m, label),
            ),
          ),
        if (m.summary != null && m.summary!.allKeywords.isNotEmpty)
          _section(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionRule(index: '05', label: 'Keywords'),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final k in m.summary!.allKeywords) _KeywordChip(text: k),
                  ],
                ),
              ],
            ),
          ),
        if (m.summary != null && m.summary!.followUps.isNotEmpty)
          _section(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionRule(index: '06', label: 'Follow-ups'),
                for (final f in m.summary!.followUps)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(AppIcons.cornerDownRight,
                            size: 14, color: c.textFaint),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(f,
                              style: TextStyle(
                                  fontSize: 14, height: 1.4, color: c.textBody)),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _section({required Widget child, Key? key}) => Padding(
        key: key,
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
        child: child,
      );

  // ---------------- processing / failed states ----------------

  Widget _processingView(OttoColors c, Meeting m) {
    final pct = m.progressStep.percent;
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 48,
            height: 48,
            child: CircularProgressIndicator(strokeWidth: 3, color: Flame.f500),
          ),
          const SizedBox(height: 20),
          Text('Still making your notes…',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: c.textPrimary)),
          const SizedBox(height: 6),
          Text('${m.progressStep.label.toUpperCase()} · $pct%',
              style: AppType.mono(
                  size: 11, letterSpacing: 1.1, color: c.textMuted)),
          const SizedBox(height: 20),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 260),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: pct / 100,
                minHeight: 6,
                backgroundColor: c.isDark ? Paper.p800 : Paper.p200,
                color: Flame.f500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _stateView(OttoColors c, Meeting m,
      {required IconData icon,
      required String title,
      required String message,
      bool showRetry = false}) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 30, color: c.textMuted),
          const SizedBox(height: 14),
          Text(title,
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: c.textPrimary)),
          const SizedBox(height: 6),
          Text(message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, height: 1.5, color: c.textMuted)),
          const SizedBox(height: 20),
          if (showRetry)
            TextButton(
              onPressed: () async {
                try {
                  await ref
                      .read(meetingDetailProvider(widget.meetingId).notifier)
                      .retry();
                } catch (e) {
                  _snack('Couldn’t retry: $e');
                }
              },
              child: const Text('Retry processing'),
            ),
        ],
      ),
    );
  }

  Widget _errorScaffold(OttoColors c, Object e) => SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: Icon(AppIcons.chevronLeft, color: c.textSecondary),
              ),
            ),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('Couldn’t load this meeting.\n$e',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: c.textMuted)),
                ),
              ),
            ),
          ],
        ),
      );

  // ---------------- actions ----------------

  String _titleOf(Meeting m) =>
      (m.title?.trim().isNotEmpty ?? false) ? m.title!.trim() : 'Untitled meeting';

  Future<void> _renameTitle(Meeting m) async {
    final controller = TextEditingController(text: m.title ?? '');
    final c = OttoColors.of(context);
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.bg,
        title: Text('Rename meeting', style: TextStyle(color: c.textPrimary, fontSize: 17)),
        content: TextField(
          controller: controller,
          autofocus: true,
          cursorColor: Flame.f500,
          style: TextStyle(color: c.textPrimary),
          onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
              child: const Text('Save')),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      await ref.read(meetingDetailProvider(widget.meetingId).notifier).renameTitle(name);
    } catch (e) {
      _snack('Couldn’t rename: $e');
    }
  }

  Future<void> _renameSpeaker(Meeting m, String label) async {
    final controller =
        TextEditingController(text: m.speakerNames[label] ?? '');
    final c = OttoColors.of(context);
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.bg,
        title: Text('Rename speaker', style: TextStyle(color: c.textPrimary, fontSize: 17)),
        content: TextField(
          controller: controller,
          autofocus: true,
          cursorColor: Flame.f500,
          style: TextStyle(color: c.textPrimary),
          decoration: InputDecoration(hintText: m.speakerDisplayName(label)),
          onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
              child: const Text('Save')),
        ],
      ),
    );
    if (name == null) return;
    try {
      await ref
          .read(meetingDetailProvider(widget.meetingId).notifier)
          .renameSpeaker(label, name);
    } catch (e) {
      _snack('Couldn’t rename speaker: $e');
    }
  }

  Future<void> _moreMenu(Meeting m) async {
    final c = OttoColors.of(context);
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: c.bg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _menuTile(ctx, AppIcons.pencil, 'Rename', 'rename'),
            _menuTile(ctx, AppIcons.folder, 'Move to workspace', 'move'),
            _menuTile(ctx, AppIcons.alertTriangle, 'Delete', 'delete',
                danger: true),
          ],
        ),
      ),
    );
    if (choice == 'rename') {
      _renameTitle(m);
    } else if (choice == 'move') {
      _moveWorkspace(m);
    } else if (choice == 'delete') {
      _deleteMeeting(m);
    }
  }

  Widget _menuTile(BuildContext ctx, IconData icon, String label, String value,
      {bool danger = false}) {
    final c = OttoColors.of(ctx);
    final color = danger ? redTint(c.isDark).fg : c.textPrimary;
    return ListTile(
      leading: Icon(icon, size: 20, color: color),
      title: Text(label, style: TextStyle(color: color)),
      onTap: () => Navigator.of(ctx).pop(value),
    );
  }

  Future<void> _moveWorkspace(Meeting m) async {
    final workspaces = ref.read(workspacesProvider).valueOrNull ?? const [];
    final c = OttoColors.of(context);
    final id = await showModalBottomSheet<String?>(
      context: context,
      backgroundColor: c.bg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final w in workspaces)
              ListTile(
                leading: Container(
                    width: 12,
                    height: 12,
                    decoration:
                        BoxDecoration(color: w.dotColor, shape: BoxShape.circle)),
                title: Text(w.name, style: TextStyle(color: c.textPrimary)),
                trailing: m.workspaceId == w.id
                    ? const Icon(AppIcons.check, size: 16, color: Flame.f500)
                    : null,
                onTap: () => Navigator.of(ctx).pop(w.id),
              ),
          ],
        ),
      ),
    );
    if (id == null) return;
    try {
      await ref
          .read(meetingDetailProvider(widget.meetingId).notifier)
          .moveToWorkspace(id);
    } catch (e) {
      _snack('Couldn’t move meeting: $e');
    }
  }

  Future<void> _deleteMeeting(Meeting m) async {
    final c = OttoColors.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.bg,
        title: Text('Delete meeting?', style: TextStyle(color: c.textPrimary)),
        content: Text('This permanently removes the recording and notes.',
            style: TextStyle(color: c.textMuted)),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text('Delete', style: TextStyle(color: redTint(c.isDark).fg))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(meetingsApiProvider).deleteMeeting(widget.meetingId);
      ref.invalidate(meetingsListProvider);
      if (mounted) Navigator.of(context).maybePop();
    } catch (e) {
      _snack('Couldn’t delete: $e');
    }
  }

  void _exportMarkdown(Meeting m) {
    Clipboard.setData(ClipboardData(text: meetingToMarkdown(m)));
    _snack('Markdown copied to clipboard');
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ---------------- helpers ----------------

  Map<String, Color> _speakerColorMap(Meeting m) {
    final map = <String, Color>{};
    var i = 0;
    for (final s in m.segments) {
      final label = s.speaker;
      if (label == null || map.containsKey(label)) continue;
      map[label] = _speakerColors[i % _speakerColors.length];
      i++;
    }
    return map;
  }

  Trust _rollupTrust(Meeting m) {
    final all = <Trust>[
      ...?m.summary?.decisions.map((d) => d.trust),
      ...m.actionItems.map((a) => a.trust),
      ...m.calendarEvents.map((e) => e.trust),
    ];
    if (all.any((t) => t.kind == TrustKind.flagged)) {
      return Trust.of(confidence: 0.3, verified: false);
    }
    if (all.any((t) => t.kind == TrustKind.review)) {
      return Trust.of(confidence: 0.6, verified: null);
    }
    return Trust.of(confidence: 1.0, verified: true);
  }
}

// ================= Header =================

class _Header extends ConsumerWidget {
  final Meeting meeting;
  final VoidCallback onBack;
  final VoidCallback onRename;
  final VoidCallback onShare;
  final VoidCallback onDownload;
  final VoidCallback onMore;

  const _Header({
    required this.meeting,
    required this.onBack,
    required this.onRename,
    required this.onShare,
    required this.onDownload,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = OttoColors.of(context);
    final m = meeting;
    final title =
        (m.title?.trim().isNotEmpty ?? false) ? m.title!.trim() : 'Untitled meeting';
    final speakers = _distinctSpeakers(m);

    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
            child: Row(
              children: [
                _iconBtn(c, AppIcons.chevronLeft, onBack, size: 22),
                Text('LIBRARY',
                    style: AppType.mono(
                        size: 10, letterSpacing: 1.4, color: c.textMuted)),
                const Spacer(),
                _iconBtn(c, AppIcons.download, onDownload),
                _iconBtn(c, AppIcons.share2, onShare),
                _iconBtn(c, AppIcons.moreHorizontal, onMore),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: onRename,
                  child: Text(title,
                      style: TextStyle(
                          fontSize: 22,
                          height: 1.12,
                          letterSpacing: -0.55,
                          fontWeight: FontWeight.w600,
                          color: c.textPrimary)),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (speakers.isNotEmpty) ...[
                      _AvatarStack(count: speakers.length),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      child: Text(
                        _metaLine(m, speakers.length).toUpperCase(),
                        style: AppType.mono(
                            size: 10, letterSpacing: 1.2, color: c.textMuted),
                      ),
                    ),
                    if (m.status == MeetingStatus.done)
                      _trustHeaderChip(m)
                    else
                      StatusChip.status(m.status),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _trustHeaderChip(Meeting m) {
    final all = <Trust>[
      ...?m.summary?.decisions.map((d) => d.trust),
      ...m.actionItems.map((a) => a.trust),
    ];
    if (all.any((t) => t.kind == TrustKind.flagged)) {
      return const StatusChip(label: 'REVIEW', tone: ChipTone.red);
    }
    if (all.any((t) => t.kind == TrustKind.review)) {
      return const StatusChip(label: 'REVIEW', tone: ChipTone.amber);
    }
    return const StatusChip(label: 'VERIFIED', tone: ChipTone.emerald);
  }

  Widget _iconBtn(OttoColors c, IconData icon, VoidCallback onTap,
          {double size = 18}) =>
      Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(icon, size: size, color: c.textSecondary)),
        ),
      );

  List<String> _distinctSpeakers(Meeting m) {
    final seen = <String>{};
    for (final s in m.segments) {
      if (s.speaker != null) seen.add(s.speaker!);
    }
    return seen.toList();
  }

  String _metaLine(Meeting m, int speakerCount) {
    final parts = <String>[];
    final n = m.numSpeakers ?? speakerCount;
    if (n > 0) parts.add('$n ${n == 1 ? 'speaker' : 'speakers'}');
    parts.add(Fmt.duration(m.durationSec));
    parts.add(Fmt.dateWithTime(m.createdAt).split(' · ').first);
    return parts.join(' · ');
  }
}

class _AvatarStack extends StatelessWidget {
  final int count;
  const _AvatarStack({required this.count});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final n = count.clamp(1, 3);
    return SizedBox(
      width: 24.0 + (n - 1) * 18,
      height: 24,
      child: Stack(
        children: [
          for (var i = 0; i < n; i++)
            Positioned(
              left: i * 18.0,
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: _speakerColors[i % _speakerColors.length],
                  shape: BoxShape.circle,
                  border: Border.all(color: c.bg, width: 2),
                ),
                alignment: Alignment.center,
                child: Text(String.fromCharCode(65 + i),
                    style: AppType.mono(
                        size: 10, weight: FontWeight.w600, color: Colors.white)),
              ),
            ),
        ],
      ),
    );
  }
}

// ================= TL;DR =================

class _TldrCard extends StatelessWidget {
  final String tldr;
  const _TldrCard({required this.tldr});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.flameTint,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.flameTintBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(AppIcons.zap, size: 11, color: c.flameText),
              const SizedBox(width: 6),
              Text('TL;DR',
                  style: AppType.mono(
                      size: 9.5, letterSpacing: 1.5, color: c.flameText)),
              const SizedBox(width: 8),
              Expanded(
                  child: Container(
                      height: 1,
                      color: c.flameText.withValues(alpha: 0.3))),
            ],
          ),
          const SizedBox(height: 10),
          _MarkText(
            text: tldr,
            base: TextStyle(
                fontSize: 15,
                height: 1.5,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.075,
                color: c.textPrimary),
            highlightBg: c.isDark
                ? Flame.f800.withValues(alpha: 0.4)
                : Flame.f200.withValues(alpha: 0.7),
          ),
        ],
      ),
    );
  }
}

/// Renders text containing <mark>…</mark> spans with a flame highlight.
class _MarkText extends StatelessWidget {
  final String text;
  final TextStyle base;
  final Color highlightBg;
  const _MarkText(
      {required this.text, required this.base, required this.highlightBg});

  @override
  Widget build(BuildContext context) {
    final spans = <InlineSpan>[];
    final re = RegExp(r'<mark>(.*?)</mark>', dotAll: true);
    var last = 0;
    for (final match in re.allMatches(text)) {
      if (match.start > last) {
        spans.add(TextSpan(text: text.substring(last, match.start)));
      }
      spans.add(TextSpan(
        text: match.group(1),
        style: TextStyle(backgroundColor: highlightBg),
      ));
      last = match.end;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return Text.rich(TextSpan(style: base, children: spans));
  }
}

// ================= Decisions =================

class _Decisions extends StatelessWidget {
  final List<Decision> decisions;
  final Map<int, double> timeByIdx;
  final ValueChanged<List<int>> onSource;

  const _Decisions(
      {required this.decisions,
      required this.timeByIdx,
      required this.onSource});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionRule(
          index: '02',
          label: 'Decisions',
          trailing: Text('${decisions.length}',
              style: AppType.mono(size: 10, color: c.textFaint)),
        ),
        for (var i = 0; i < decisions.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _DecisionCard(
              index: i,
              decision: decisions[i],
              time: _sourceTime(decisions[i].sourceSegmentIndices),
              onSource: () => onSource(decisions[i].sourceSegmentIndices),
            ),
          ),
      ],
    );
  }

  String? _sourceTime(List<int> idxs) {
    if (idxs.isEmpty) return null;
    final t = timeByIdx[idxs.first];
    return t == null ? null : Fmt.clock(t);
  }
}

class _DecisionCard extends StatelessWidget {
  final int index;
  final Decision decision;
  final String? time;
  final VoidCallback onSource;

  const _DecisionCard(
      {required this.index,
      required this.decision,
      required this.time,
      required this.onSource});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.borderSoft),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('D.0${index + 1}',
                    style: AppType.mono(
                        size: 10, color: c.flameText, weight: FontWeight.w500)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(decision.text,
                    style: TextStyle(
                        fontSize: 14, height: 1.5, color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(left: 32),
            child: Row(
              children: [
                TrustBadge.fromTrust(decision.trust, small: true),
                if (time != null) ...[
                  const SizedBox(width: 6),
                  SourceLink(time: time!, onTap: onSource),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ================= Action items =================

class _ActionItems extends ConsumerWidget {
  final String meetingId;
  final List<ActionItem> items;
  final Map<int, double> timeByIdx;
  final ValueChanged<List<int>> onSource;

  const _ActionItems(
      {required this.meetingId,
      required this.items,
      required this.timeByIdx,
      required this.onSource});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = OttoColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionRule(
          index: '03',
          label: 'Action items',
          trailing: Text('${items.length}',
              style: AppType.mono(size: 10, color: c.textFaint)),
        ),
        for (final a in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: _ActionItemCard(
              item: a,
              time: _sourceTime(a.sourceSegmentIndices),
              onToggle: () async {
                try {
                  await ref
                      .read(meetingDetailProvider(meetingId).notifier)
                      .toggleActionItem(a);
                } catch (_) {}
              },
              onSource: () => onSource(a.sourceSegmentIndices),
            ),
          ),
      ],
    );
  }

  String? _sourceTime(List<int> idxs) {
    if (idxs.isEmpty) return null;
    final t = timeByIdx[idxs.first];
    return t == null ? null : Fmt.clock(t);
  }
}

class _ActionItemCard extends StatelessWidget {
  final ActionItem item;
  final String? time;
  final VoidCallback onToggle;
  final VoidCallback onSource;

  const _ActionItemCard(
      {required this.item,
      required this.time,
      required this.onToggle,
      required this.onSource});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.borderSoft),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: onToggle,
            child: Container(
              margin: const EdgeInsets.only(top: 2),
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: item.isDone ? Accent.emerald500 : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                    color: item.isDone
                        ? Accent.emerald500
                        : (c.isDark ? Paper.p700 : Paper.p300)),
              ),
              child: item.isDone
                  ? const Icon(AppIcons.check, size: 13, color: Colors.white)
                  : null,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.task,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.3,
                      color: c.textPrimary,
                      decoration:
                          item.isDone ? TextDecoration.lineThrough : null,
                      decorationColor: c.textMuted,
                    )),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _assigneeChip(c),
                    if (item.dueDate != null && item.dueDate!.trim().isNotEmpty)
                      _dueChip(c, item.dueDate!),
                    TrustBadge.fromTrust(item.trust, small: true),
                    if (time != null) SourceLink(time: time!, onTap: onSource),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _assigneeChip(OttoColors c) {
    if (item.assignee.trim().isEmpty) {
      return Container(
        height: 20,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
              color: c.isDark ? Paper.p700 : Paper.p300,
              style: BorderStyle.solid),
        ),
        alignment: Alignment.center,
        child: Text('Unassigned',
            style: TextStyle(fontSize: 11, color: c.textMuted)),
      );
    }
    final initial = item.assignee.trim()[0].toUpperCase();
    return Container(
      height: 20,
      padding: const EdgeInsets.only(left: 4, right: 6),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: c.borderSoft),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
                color: Flame.f500, borderRadius: BorderRadius.circular(4)),
            alignment: Alignment.center,
            child: Text(initial,
                style: const TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w600,
                    color: Colors.white)),
          ),
          const SizedBox(width: 4),
          Text(item.assignee,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: c.textPrimary)),
        ],
      ),
    );
  }

  Widget _dueChip(OttoColors c, String due) {
    final t = flameChipTint(c.isDark);
    return Container(
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration:
          BoxDecoration(color: t.bg, borderRadius: BorderRadius.circular(6)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(AppIcons.calendar, size: 9, color: t.fg),
          const SizedBox(width: 4),
          Text(due,
              style: AppType.mono(size: 10, letterSpacing: 0.5, color: t.fg)),
        ],
      ),
    );
  }
}

// ================= Transcript =================

class _Transcript extends StatelessWidget {
  final Meeting meeting;
  final Map<String, Color> speakerColor;
  final Map<int, GlobalKey> segmentKeys;
  final bool searchOpen;
  final String query;
  final bool expanded;
  final int cap;
  final VoidCallback onToggleSearch;
  final ValueChanged<String> onQuery;
  final VoidCallback onExpand;
  final ValueChanged<int> onSeek;
  final ValueChanged<String> onRenameSpeaker;

  const _Transcript({
    required this.meeting,
    required this.speakerColor,
    required this.segmentKeys,
    required this.searchOpen,
    required this.query,
    required this.expanded,
    required this.cap,
    required this.onToggleSearch,
    required this.onQuery,
    required this.onExpand,
    required this.onSeek,
    required this.onRenameSpeaker,
  });

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final q = query.trim().toLowerCase();
    final all = meeting.segments;
    final filtered = q.isEmpty
        ? all
        : all.where((s) => s.text.toLowerCase().contains(q)).toList();
    final showAll = expanded || q.isNotEmpty;
    final visible = showAll ? filtered : filtered.take(cap).toList();
    final hidden = filtered.length - visible.length;

    final labels = speakerColor.keys.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionRule(
          index: '04',
          label: 'Transcript',
          trailing: GestureDetector(
            onTap: onToggleSearch,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(AppIcons.search, size: 10, color: c.textMuted),
                const SizedBox(width: 4),
                Text('FIND',
                    style: AppType.mono(
                        size: 9.5, letterSpacing: 1.4, color: c.textMuted)),
              ],
            ),
          ),
        ),
        if (searchOpen)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextField(
              autofocus: true,
              onChanged: onQuery,
              style: TextStyle(fontSize: 14, color: c.textPrimary),
              cursorColor: Flame.f500,
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Search transcript…',
                hintStyle: TextStyle(color: c.textMuted, fontSize: 14),
                prefixIcon: Icon(AppIcons.search, size: 15, color: c.textMuted),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: c.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Flame.f500, width: 1.5),
                ),
              ),
            ),
          ),
        // speaker legend
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              for (final label in labels)
                GestureDetector(
                  onTap: () => onRenameSpeaker(label),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                              color: speakerColor[label],
                              borderRadius: BorderRadius.circular(2))),
                      const SizedBox(width: 6),
                      Text(meeting.speakerDisplayName(label).toUpperCase(),
                          style: AppType.mono(
                              size: 10,
                              letterSpacing: 1.0,
                              color: speakerColor[label],
                              weight: FontWeight.w500)),
                      const SizedBox(width: 4),
                      Icon(AppIcons.pencil, size: 9, color: c.textFaint),
                    ],
                  ),
                ),
            ],
          ),
        ),
        for (final seg in visible) _segmentRow(context, c, seg),
        if (hidden > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Center(
              child: GestureDetector(
                onTap: onExpand,
                child: Text('+ $hidden MORE SEGMENTS',
                    style: AppType.mono(
                        size: 10, letterSpacing: 1.4, color: c.textFaint)),
              ),
            ),
          ),
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text('No matching segments.',
                style: TextStyle(fontSize: 13, color: c.textMuted)),
          ),
      ],
    );
  }

  Widget _segmentRow(BuildContext context, OttoColors c, Segment seg) {
    final color = seg.speaker == null
        ? c.textMuted
        : (speakerColor[seg.speaker] ?? c.textMuted);
    final key = segmentKeys.putIfAbsent(seg.idx, () => GlobalKey());
    return Padding(
      key: key,
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () => onSeek(seg.idx),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 36,
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(Fmt.clock(seg.startSec),
                      style: AppType.mono(size: 10, color: c.textFaint)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                                color: color,
                                borderRadius: BorderRadius.circular(2))),
                        const SizedBox(width: 6),
                        Text(meeting.speakerDisplayName(seg.speaker).toUpperCase(),
                            style: AppType.mono(
                                size: 10,
                                letterSpacing: 1.0,
                                color: color,
                                weight: FontWeight.w500)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(seg.text,
                        style: TextStyle(
                            fontSize: 14, height: 1.55, color: c.textBody)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ================= Keyword chip =================

class _KeywordChip extends StatelessWidget {
  final String text;
  const _KeywordChip({required this.text});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.borderSoft),
      ),
      child: Text(text,
          style: TextStyle(fontSize: 12.5, color: c.textBody)),
    );
  }
}
