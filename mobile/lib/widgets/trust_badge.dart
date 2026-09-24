import 'package:flutter/material.dart';

import '../models/meeting.dart';
import '../theme/app_theme.dart';
import 'app_icons.dart';

/// Confidence / verification badge — the product's core trust affordance.
/// Mirrors TrustBadge in mobile-core.jsx (verified · high · review · flagged).
class TrustBadge extends StatelessWidget {
  final TrustKind kind;
  final int? pct;
  final bool small;

  const TrustBadge({super.key, required this.kind, this.pct, this.small = false});

  TrustBadge.fromTrust(Trust trust, {super.key, this.small = false})
      : kind = trust.kind,
        pct = trust.pct;

  @override
  Widget build(BuildContext context) {
    final dark = OttoColors.of(context).isDark;
    final style = _styleFor(kind, dark);
    final h = small ? 18.0 : 21.0;
    final label = pct != null ? '$pct%' : style.label;
    return Container(
      height: h,
      padding: EdgeInsets.symmetric(horizontal: small ? 6 : 8),
      decoration: BoxDecoration(
        color: style.bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: style.fg.withValues(alpha: dark ? 0.35 : 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: small ? 10 : 11, color: style.fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppType.mono(
              size: small ? 9.5 : 10,
              weight: FontWeight.w500,
              letterSpacing: (small ? 9.5 : 10) * 0.1,
              color: style.fg,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }

  _TrustStyle _styleFor(TrustKind kind, bool dark) {
    switch (kind) {
      case TrustKind.verified:
        return _TrustStyle(emeraldTint(dark), AppIcons.badgeCheck, 'VERIFIED');
      case TrustKind.high:
        return _TrustStyle(emeraldTint(dark), AppIcons.shieldCheck, 'HIGH');
      case TrustKind.review:
        return _TrustStyle(amberTint(dark), AppIcons.flag, 'REVIEW');
      case TrustKind.flagged:
        return _TrustStyle(redTint(dark), AppIcons.alertTriangle, 'FLAGGED');
    }
  }
}

class _TrustStyle {
  final Color bg;
  final Color fg;
  final IconData icon;
  final String label;
  _TrustStyle(Tint t, this.icon, this.label)
      : bg = t.bg,
        fg = t.fg;
}
