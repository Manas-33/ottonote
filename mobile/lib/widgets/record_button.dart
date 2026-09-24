import 'package:flutter/material.dart';

import '../theme/palette.dart';

/// The record affordance: concentric flame rings around a flame core that
/// morphs from a disc (idle) to a rounded square (active). Mirrors RecordButton
/// in mobile-core.jsx.
class RecordButton extends StatefulWidget {
  final double size;
  final bool active;
  final VoidCallback? onTap;

  const RecordButton({
    super.key,
    this.size = 64,
    this.active = false,
    this.onTap,
  });

  @override
  State<RecordButton> createState() => _RecordButtonState();
}

class _RecordButtonState extends State<RecordButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ring = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void initState() {
    super.initState();
    if (widget.active) _ring.repeat();
  }

  @override
  void didUpdateWidget(RecordButton old) {
    super.didUpdateWidget(old);
    if (widget.active && !_ring.isAnimating) {
      _ring.repeat();
    } else if (!widget.active && _ring.isAnimating) {
      _ring.stop();
    }
  }

  @override
  void dispose() {
    _ring.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    final inset = 6.0;
    final coreSide = widget.active ? s * 0.34 : s * 0.44;

    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: s,
        height: s,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // soft flame halo
            Container(
              decoration: BoxDecoration(
                color: Flame.f500.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
            ),
            // static inner ring
            Padding(
              padding: EdgeInsets.all(inset),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: Flame.f500.withValues(alpha: 0.30), width: 2),
                ),
              ),
            ),
            // pulsing ring when active
            if (widget.active)
              AnimatedBuilder(
                animation: _ring,
                builder: (context, _) {
                  final t = _ring.value;
                  final scale = 0.9 + t * 0.9; // 0.9 → 1.8
                  final opacity = (0.6 * (1 - t)).clamp(0.0, 1.0);
                  return Transform.scale(
                    scale: scale,
                    child: Padding(
                      padding: EdgeInsets.all(inset),
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Flame.f500.withValues(alpha: 0.5 * opacity),
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            // flame core
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: widget.active ? coreSide : coreSide,
              height: coreSide,
              decoration: BoxDecoration(
                color: Flame.f500,
                borderRadius: BorderRadius.circular(widget.active ? 6 : coreSide),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x59FFFFFF),
                    offset: Offset(0, 1),
                    blurRadius: 0,
                    spreadRadius: -1,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
