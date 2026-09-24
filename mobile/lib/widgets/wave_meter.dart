import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/palette.dart';

/// Live level meter / waveform. Mirrors WaveMeter in mobile-core.jsx: bars
/// oscillate continuously; the trailing bars glow flame. An optional [level]
/// (0..1, e.g. from the recorder's amplitude) scales the motion.
class WaveMeter extends StatefulWidget {
  final int bars;
  final bool live;
  final double level;

  const WaveMeter({super.key, this.bars = 48, this.live = true, this.level = 1});

  @override
  State<WaveMeter> createState() => _WaveMeterState();
}

class _WaveMeterState extends State<WaveMeter>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void initState() {
    super.initState();
    if (widget.live) _ctrl.repeat();
  }

  @override
  void didUpdateWidget(WaveMeter old) {
    super.didUpdateWidget(old);
    if (widget.live && !_ctrl.isAnimating) _ctrl.repeat();
    if (!widget.live && _ctrl.isAnimating) _ctrl.stop();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = OttoColors.of(context).isDark;
    return SizedBox(
      height: 64,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) => CustomPaint(
          size: Size.infinite,
          painter: _WavePainter(
            phase: _ctrl.value * 2 * math.pi,
            bars: widget.bars,
            level: widget.level.clamp(0.0, 1.0),
            base: dark ? Paper.p700 : Paper.p300,
            recent: Flame.f500,
            live: widget.live,
          ),
        ),
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  final double phase;
  final int bars;
  final double level;
  final Color base;
  final Color recent;
  final bool live;

  _WavePainter({
    required this.phase,
    required this.bars,
    required this.level,
    required this.base,
    required this.recent,
    required this.live,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const barW = 3.0;
    const gap = 3.0;
    final totalW = bars * barW + (bars - 1) * gap;
    var x = (size.width - totalW) / 2;
    final cy = size.height / 2;
    final amp = 0.35 + 0.65 * level;

    for (var i = 0; i < bars; i++) {
      final p = i * 0.55 + phase;
      final h = 4 +
          (math.sin(p).abs() * 40 + math.sin(p * 0.3 + i).abs() * 8) * amp;
      final isRecent = live && i > bars - 6;
      final paint = Paint()..color = isRecent ? recent : base;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, cy - h / 2, barW, h),
        const Radius.circular(1),
      );
      canvas.drawRRect(rect, paint);
      x += barW + gap;
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) =>
      old.phase != phase || old.level != level || old.base != base;
}
