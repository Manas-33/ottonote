import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/palette.dart';

/// OttoNote mark: an outer ring with an offset filled flame disc.
/// Transcribed from the svg mark in mobile-core.jsx (viewBox 0 0 24 24).
class Logo extends StatelessWidget {
  final double size;
  const Logo({super.key, this.size = 22});

  @override
  Widget build(BuildContext context) {
    final ring = OttoColors.of(context).textPrimary;
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _LogoPainter(ring)),
    );
  }
}

class _LogoPainter extends CustomPainter {
  final Color ring;
  _LogoPainter(this.ring);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24.0; // design viewBox unit
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2 * s
      ..color = ring;
    canvas.drawCircle(Offset(12 * s, 12 * s), 9.5 * s, ringPaint);

    final dot = Paint()..color = Flame.f500;
    canvas.drawCircle(Offset(14.2 * s, 12 * s), 4.2 * s, dot);
  }

  @override
  bool shouldRepaint(_LogoPainter old) => old.ring != ring;
}
