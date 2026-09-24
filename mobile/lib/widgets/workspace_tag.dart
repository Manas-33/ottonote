import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Workspace pill (colored dot + name). Mirrors WorkspaceTag in mobile-core.jsx.
class WorkspaceTag extends StatelessWidget {
  final String name;
  final Color dotColor;
  const WorkspaceTag({super.key, required this.name, required this.dotColor});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Container(
      height: 20,
      padding: const EdgeInsets.only(left: 6, right: 8),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: c.borderSoft),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            name,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: c.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
