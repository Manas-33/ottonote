import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Mono section header with a numbered index and a trailing hairline rule.
/// Mirrors SecRule in mobile-core.jsx.
class SectionRule extends StatelessWidget {
  final String? index;
  final String label;
  final Widget? trailing;

  const SectionRule({
    super.key,
    this.index,
    required this.label,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          if (index != null) ...[
            Text(
              index!,
              style: AppType.mono(
                size: 10,
                letterSpacing: 1.6,
                color: c.textFaint,
                weight: FontWeight.w500,
              ),
            ),
            const SizedBox(width: 10),
          ],
          Text(
            label.toUpperCase(),
            style: AppType.mono(
              size: 10,
              letterSpacing: 1.6,
              color: c.textSecondary,
              weight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Container(height: 1, color: c.textPrimary.withValues(alpha: 0.14))),
          if (trailing != null) ...[
            const SizedBox(width: 10),
            trailing!,
          ],
        ],
      ),
    );
  }
}
