import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../utils/format.dart';
import 'app_icons.dart';

/// Persistent docked audio player. Mirrors AudioPlayer in mobile-core.jsx.
/// Purely presentational — the detail screen owns the just_audio player.
class AudioPlayerBar extends StatelessWidget {
  final bool playing;
  final Duration position;
  final Duration duration;
  final double speed;
  final bool enabled;
  final VoidCallback? onToggle;
  final ValueChanged<double>? onSeekFraction; // 0..1
  final VoidCallback? onCycleSpeed;

  const AudioPlayerBar({
    super.key,
    required this.playing,
    required this.position,
    required this.duration,
    this.speed = 1.0,
    this.enabled = true,
    this.onToggle,
    this.onSeekFraction,
    this.onCycleSpeed,
  });

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final totalMs = duration.inMilliseconds;
    final pct = totalMs == 0
        ? 0.0
        : (position.inMilliseconds / totalMs).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: c.surfaceMuted.withValues(alpha: c.isDark ? 0.80 : 0.90),
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            _PlayButton(playing: playing, onTap: enabled ? onToggle : null, c: c),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  LayoutBuilder(
                    builder: (context, cons) => GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapDown: enabled && onSeekFraction != null
                          ? (d) => onSeekFraction!(
                              (d.localPosition.dx / cons.maxWidth)
                                  .clamp(0.0, 1.0))
                          : null,
                      child: SizedBox(
                        height: 18,
                        width: double.infinity,
                        child: CustomPaint(
                          painter: _MiniWave(
                            pct: pct * 100,
                            base: c.isDark ? Paper.p700 : Paper.p300,
                            fill: Flame.f500,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(Fmt.clock(position.inSeconds.toDouble()),
                          style: AppType.mono(
                              size: 10,
                              letterSpacing: 0.6,
                              color: c.textSecondary)),
                      Text(Fmt.clock(duration.inSeconds.toDouble()),
                          style: AppType.mono(
                              size: 10,
                              letterSpacing: 0.6,
                              color: c.textMuted)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            _SpeedButton(speed: speed, onTap: enabled ? onCycleSpeed : null, c: c),
          ],
        ),
      ),
    );
  }
}

class _PlayButton extends StatelessWidget {
  final bool playing;
  final VoidCallback? onTap;
  final OttoColors c;
  const _PlayButton({required this.playing, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: c.inkBg,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            playing ? AppIcons.pause : AppIcons.play,
            size: 17,
            color: c.inkFg,
          ),
        ),
      ),
    );
  }
}

class _SpeedButton extends StatelessWidget {
  final double speed;
  final VoidCallback? onTap;
  final OttoColors c;
  const _SpeedButton({required this.speed, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    final label = '${speed.toStringAsFixed(1)}×';
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          alignment: Alignment.center,
          child: Text(label,
              style: AppType.mono(
                  size: 11, weight: FontWeight.w500, color: c.textSecondary)),
        ),
      ),
    );
  }
}

class _MiniWave extends CustomPainter {
  final double pct; // 0..100
  final Color base;
  final Color fill;
  _MiniWave({required this.pct, required this.base, required this.fill});

  @override
  void paint(Canvas canvas, Size size) {
    const n = 40;
    final slot = size.width / n;
    const barW = 2.0;
    for (var i = 0; i < n; i++) {
      final on = (i / n) * 100 <= pct;
      final h = 5 + math.sin(i * 0.9).abs() * 13;
      final x = i * slot + (slot - barW) / 2;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, (size.height - h) / 2, barW, h),
        const Radius.circular(1),
      );
      canvas.drawRRect(rect, Paint()..color = on ? fill : base);
    }
  }

  @override
  bool shouldRepaint(_MiniWave old) => old.pct != pct || old.base != base;
}
