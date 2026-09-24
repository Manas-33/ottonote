import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'app_icons.dart';

/// Source-jump chip that links a claim back to its transcript position.
/// Mirrors SourceLink in mobile-core.jsx.
class SourceLink extends StatelessWidget {
  final String time; // e.g. "04:12"
  final VoidCallback? onTap;

  const SourceLink({super.key, required this.time, this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Material(
      color: c.flameSoftBg,
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          height: 21,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: c.flameSoftBorder),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(AppIcons.cornerDownLeft, size: 10, color: c.flameStrongText),
              const SizedBox(width: 4),
              Text(
                time,
                style: AppType.mono(
                  size: 10,
                  weight: FontWeight.w500,
                  letterSpacing: 0.8,
                  color: c.flameStrongText,
                  height: 1.0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
