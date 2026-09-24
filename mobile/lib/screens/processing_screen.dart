import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/meeting.dart';
import '../providers/core_providers.dart';
import '../providers/meetings_providers.dart';
import '../services/capture_controller.dart';
import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../utils/format.dart';
import '../widgets/app_icons.dart';
import '../widgets/logo.dart';
import 'meeting_detail_screen.dart';

/// 04 · Processing. Overall bar + ordered pipeline ledger. The upload is the
/// first step; backend stages come from the polled progress_step.
class ProcessingScreen extends ConsumerStatefulWidget {
  const ProcessingScreen({super.key});

  @override
  ConsumerState<ProcessingScreen> createState() => _ProcessingScreenState();
}

class _ProcessingScreenState extends ConsumerState<ProcessingScreen> {
  bool _navigated = false;

  static const _labels = [
    'Uploading audio',
    'Transcribing',
    'Diarizing speakers',
    'Summarizing',
    'Verifying claims',
  ];

  /// Backend progress_step → active row among the 5 visible rows (monotonic).
  int _activeRow(ProgressStep? step) {
    switch (step) {
      case null:
      case ProgressStep.normalizing:
      case ProgressStep.transcribing:
        return 1;
      case ProgressStep.diarizing:
        return 2;
      case ProgressStep.summarizing:
        return 3;
      case ProgressStep.verifying:
      case ProgressStep.resolving:
      case ProgressStep.finalizing:
        return 4;
    }
  }

  void _goToDetail(String meetingId) {
    if (_navigated) return;
    _navigated = true;
    // Defer provider mutation + navigation out of build (can't modify a
    // provider while the widget tree is building).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(captureControllerProvider.notifier).reset();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
            builder: (_) => MeetingDetailScreen(meetingId: meetingId)),
      );
    });
  }

  Future<void> _cancel() async {
    final capture = ref.read(captureControllerProvider);
    if (capture is CaptureProcessing) {
      try {
        await ref.read(meetingsApiProvider).cancelMeeting(capture.meetingId);
      } catch (_) {}
    }
    ref.read(captureControllerProvider.notifier).reset();
    ref.invalidate(meetingsListProvider);
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final capture = ref.watch(captureControllerProvider);

    // Defaults for the uploading phase (no meeting yet).
    bool uploading = capture is CaptureUploading;
    double uploadFraction = capture is CaptureUploading ? capture.progress : 0;
    int overall = uploading ? (5 + uploadFraction * 10).round() : 0;
    int activeRow = 0;
    String subtitle = 'Your recording';
    bool failed = capture is CaptureFailed;
    String? failMessage = capture is CaptureFailed ? capture.message : null;

    if (capture is CaptureProcessing) {
      final detail = ref.watch(meetingDetailProvider(capture.meetingId));
      final m = detail.valueOrNull;
      if (m != null) {
        subtitle =
            '${(m.title?.trim().isNotEmpty ?? false) ? m.title!.trim() : 'Untitled meeting'} · ${Fmt.duration(m.durationSec)}';
        if (m.status == MeetingStatus.done) {
          _goToDetail(capture.meetingId);
        } else if (m.status == MeetingStatus.failed) {
          failed = true;
          failMessage = m.errorMessage ?? 'Processing failed.';
        } else if (m.status == MeetingStatus.cancelled) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && !_navigated) Navigator.of(context).popUntil((r) => r.isFirst);
          });
        }
        activeRow = _activeRow(m.progressStep);
        overall = m.progressStep.percent;
      } else {
        activeRow = 1;
        overall = 5;
      }
    }

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            _topBar(c, failed),
            Expanded(
              child: failed
                  ? _failedView(c, failMessage ?? 'Something went wrong.')
                  : _body(c, uploading, activeRow, overall, subtitle),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topBar(OttoColors c, bool failed) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Row(
        children: [
          _StatusPill(failed: failed),
          const Spacer(),
          TextButton(
            onPressed: _cancel,
            style: TextButton.styleFrom(
                padding: EdgeInsets.zero, minimumSize: const Size(44, 32)),
            child: Text(failed ? 'CLOSE' : 'CANCEL',
                style: AppType.mono(
                    size: 10, letterSpacing: 1.2, color: c.textMuted)),
          ),
        ],
      ),
    );
  }

  Widget _body(OttoColors c, bool uploading, int activeRow, int overall,
      String subtitle) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: Column(
          children: [
            const _SpinnerLogo(),
            const SizedBox(height: 24),
            Text('Making your notes…',
                style: TextStyle(
                    fontSize: 23,
                    height: 1.1,
                    letterSpacing: -0.46,
                    fontWeight: FontWeight.w600,
                    color: c.textPrimary)),
            const SizedBox(height: 6),
            Text(subtitle.toUpperCase(),
                textAlign: TextAlign.center,
                style: AppType.mono(
                    size: 11, letterSpacing: 1.1, color: c.textMuted)),
            const SizedBox(height: 36),
            _overall(c, overall),
            const SizedBox(height: 32),
            _ledger(c, uploading, activeRow),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(AppIcons.bell, size: 11, color: c.textFaint),
                const SizedBox(width: 6),
                Text('WE’LL NOTIFY YOU WHEN IT’S READY',
                    style: AppType.mono(
                        size: 10, letterSpacing: 1.4, color: c.textFaint)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _overall(OttoColors c, int overall) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('OVERALL',
                style: AppType.mono(
                    size: 10, letterSpacing: 1.2, color: c.textSecondary)),
            Text('$overall%',
                style: AppType.mono(
                    size: 10, letterSpacing: 1.2, color: c.flameText)),
          ],
        ),
        const SizedBox(height: 8),
        _ShimmerBar(fraction: (overall / 100).clamp(0.0, 1.0)),
      ],
    );
  }

  Widget _ledger(OttoColors c, bool uploading, int activeRow) {
    return Column(
      children: [
        Container(height: 1, color: c.border),
        for (var i = 0; i < _labels.length; i++)
          _StepRow(
            index: i,
            label: _labels[i],
            state: _rowState(i, uploading, activeRow),
          ),
      ],
    );
  }

  _StepState _rowState(int i, bool uploading, int activeRow) {
    if (uploading) {
      if (i == 0) return _StepState.active;
      return _StepState.pending;
    }
    // Processing: upload (row 0) is done.
    if (i < activeRow) return _StepState.done;
    if (i == activeRow) return _StepState.active;
    return _StepState.pending;
  }

  Widget _failedView(OttoColors c, String message) {
    final isProcessing = ref.read(captureControllerProvider) is CaptureProcessing;
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(AppIcons.alertTriangle, size: 32, color: redTint(c.isDark).fg),
          const SizedBox(height: 16),
          Text('Processing failed',
              style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w600,
                  color: c.textPrimary)),
          const SizedBox(height: 8),
          Text(message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, height: 1.5, color: c.textMuted)),
          const SizedBox(height: 22),
          if (isProcessing)
            TextButton(
              onPressed: () async {
                final capture = ref.read(captureControllerProvider);
                if (capture is CaptureProcessing) {
                  try {
                    await ref
                        .read(meetingDetailProvider(capture.meetingId).notifier)
                        .retry();
                    setState(() {});
                  } catch (_) {}
                }
              },
              child: const Text('Retry'),
            ),
          TextButton(
            onPressed: _cancel,
            child: Text('Back to library',
                style: TextStyle(color: c.textMuted)),
          ),
        ],
      ),
    );
  }
}

enum _StepState { done, active, pending }

class _StepRow extends StatelessWidget {
  final int index;
  final String label;
  final _StepState state;
  const _StepRow(
      {required this.index, required this.label, required this.state});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final active = state == _StepState.active;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: active ? 8 : 0, vertical: 14),
      decoration: BoxDecoration(
        color: active
            ? Flame.f500.withValues(alpha: c.isDark ? 0.10 : 0.07)
            : Colors.transparent,
        borderRadius: active ? BorderRadius.circular(8) : null,
        border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.7))),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 22,
            child: Text('0${index + 1}',
                style: AppType.mono(size: 10, color: c.textFaint)),
          ),
          _marker(c),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label,
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                  color: state == _StepState.done
                      ? c.textFaint
                      : (active ? c.textPrimary : c.textMuted),
                )),
          ),
        ],
      ),
    );
  }

  Widget _marker(OttoColors c) {
    switch (state) {
      case _StepState.done:
        return Container(
          width: 20,
          height: 20,
          decoration:
              const BoxDecoration(color: Accent.emerald500, shape: BoxShape.circle),
          child: const Icon(AppIcons.check, size: 12, color: Colors.white),
        );
      case _StepState.active:
        return const SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2, color: Flame.f500),
        );
      case _StepState.pending:
        return Container(
          width: 20,
          height: 20,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: c.isDark ? Paper.p700 : Paper.p300),
          ),
        );
    }
  }
}

class _StatusPill extends StatefulWidget {
  final bool failed;
  const _StatusPill({required this.failed});

  @override
  State<_StatusPill> createState() => _StatusPillState();
}

class _StatusPillState extends State<_StatusPill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
        ..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = OttoColors.of(context).isDark;
    final t = widget.failed ? redTint(dark) : flameChipTint(dark);
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration:
          BoxDecoration(color: t.bg, borderRadius: BorderRadius.circular(6)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: widget.failed
                ? const AlwaysStoppedAnimation(1.0)
                : Tween(begin: 1.0, end: 0.3).animate(_ctrl),
            child: Container(
                width: 6,
                height: 6,
                decoration:
                    BoxDecoration(color: t.fg, borderRadius: BorderRadius.circular(2))),
          ),
          const SizedBox(width: 6),
          Text(widget.failed ? 'FAILED' : 'PROCESSING',
              style: AppType.mono(
                  size: 10, letterSpacing: 1.2, color: t.fg, weight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _SpinnerLogo extends StatelessWidget {
  const _SpinnerLogo();

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return SizedBox(
      width: 92,
      height: 92,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: c.isDark ? Paper.p800 : Paper.p200, width: 3),
            ),
          ),
          const SizedBox(
            width: 92,
            height: 92,
            child: CircularProgressIndicator(strokeWidth: 3, color: Flame.f500),
          ),
          const Logo(size: 38),
        ],
      ),
    );
  }
}

class _ShimmerBar extends StatefulWidget {
  final double fraction;
  const _ShimmerBar({required this.fraction});

  @override
  State<_ShimmerBar> createState() => _ShimmerBarState();
}

class _ShimmerBarState extends State<_ShimmerBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
        ..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 8,
        color: c.isDark ? Paper.p800 : Paper.p200,
        child: Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: widget.fraction,
            child: AnimatedBuilder(
              animation: _ctrl,
              builder: (context, _) => Stack(
                children: [
                  Container(color: Flame.f500),
                  Positioned.fill(
                    child: FractionallySizedBox(
                      alignment: Alignment(-1 + _ctrl.value * 3, 0),
                      widthFactor: 0.35,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: [
                            Colors.white.withValues(alpha: 0),
                            Colors.white.withValues(alpha: 0.4),
                            Colors.white.withValues(alpha: 0),
                          ]),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
