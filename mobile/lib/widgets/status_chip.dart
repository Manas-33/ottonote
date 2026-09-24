import 'package:flutter/material.dart';

import '../models/meeting.dart';
import '../theme/app_theme.dart';

enum ChipTone { emerald, flame, amber, red, neutral }

/// Small square-dot status chip. Mirrors StatusChip in mobile-core.jsx.
class StatusChip extends StatelessWidget {
  final String label;
  final ChipTone tone;
  final bool pulse;

  const StatusChip({
    super.key,
    required this.label,
    required this.tone,
    this.pulse = false,
  });

  /// Maps a real meeting status to a chip.
  factory StatusChip.status(MeetingStatus status) {
    switch (status) {
      case MeetingStatus.done:
        return const StatusChip(label: 'DONE', tone: ChipTone.emerald);
      case MeetingStatus.processing:
        return const StatusChip(
            label: 'PROCESSING', tone: ChipTone.flame, pulse: true);
      case MeetingStatus.pending:
        return const StatusChip(
            label: 'QUEUED', tone: ChipTone.flame, pulse: true);
      case MeetingStatus.failed:
        return const StatusChip(label: 'FAILED', tone: ChipTone.red);
      case MeetingStatus.cancelled:
        return const StatusChip(label: 'CANCELLED', tone: ChipTone.neutral);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final dark = c.isDark;
    late final Tint t;
    switch (tone) {
      case ChipTone.emerald:
        t = emeraldTint(dark);
        break;
      case ChipTone.flame:
        t = flameChipTint(dark);
        break;
      case ChipTone.amber:
        t = amberTint(dark);
        break;
      case ChipTone.red:
        t = redTint(dark);
        break;
      case ChipTone.neutral:
        t = Tint(c.surfaceMuted, c.textMuted);
        break;
    }
    return Container(
      height: 19,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Dot(color: t.fg, pulse: pulse),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppType.mono(
              size: 9.5,
              weight: FontWeight.w500,
              letterSpacing: 0.95,
              color: t.fg,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  final Color color;
  final bool pulse;
  const _Dot({required this.color, required this.pulse});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    if (widget.pulse) _ctrl.repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(
        color: widget.color,
        borderRadius: BorderRadius.circular(2),
      ),
    );
    if (!widget.pulse) return dot;
    return FadeTransition(
      opacity: Tween(begin: 1.0, end: 0.35).animate(_ctrl),
      child: dot,
    );
  }
}
