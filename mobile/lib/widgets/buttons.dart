import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/palette.dart';

enum OttoButtonVariant { ink, flame, outline, ghost, danger }

/// Shared button matching the design's btn-ink / flame / outline / ghost styles.
class OttoButton extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final OttoButtonVariant variant;
  final double height;
  final double radius;
  final EdgeInsets padding;

  const OttoButton({
    super.key,
    required this.child,
    required this.onTap,
    this.variant = OttoButtonVariant.ink,
    this.height = 54,
    this.radius = 16,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
  });

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    late final Color bg;
    late final Color fg;
    Border? border;
    switch (variant) {
      case OttoButtonVariant.ink:
        bg = c.inkBg;
        fg = c.inkFg;
        break;
      case OttoButtonVariant.flame:
        bg = Flame.f500;
        fg = Colors.white;
        break;
      case OttoButtonVariant.outline:
        bg = Colors.transparent;
        fg = c.textPrimary;
        border = Border.all(color: c.border);
        break;
      case OttoButtonVariant.ghost:
        bg = Colors.transparent;
        fg = c.textSecondary;
        break;
      case OttoButtonVariant.danger:
        bg = Accent.red600;
        fg = Colors.white;
        break;
    }
    final disabled = onTap == null;
    return Opacity(
      opacity: disabled ? 0.55 : 1,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: Container(
            height: height,
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: border,
            ),
            child: DefaultTextStyle.merge(
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.15,
                color: fg,
              ),
              child: IconTheme.merge(
                data: IconThemeData(color: fg, size: 16),
                child: Center(child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
