import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/app_icons.dart';

/// Rounded-top bottom-sheet container with grab handle + title row.
/// Mirrors SheetOverlay in mobile-sheets.jsx.
Future<T?> showOttoSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
}) {
  final c = OttoColors.of(context);
  return showModalBottomSheet<T>(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: c.scrim,
    isScrollControlled: true,
    builder: (ctx) => _SheetShell(child: Builder(builder: builder)),
  );
}

class _SheetShell extends StatelessWidget {
  final Widget child;
  const _SheetShell({required this.child});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: c.isDark ? c.surfaceMuted : c.bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.only(top: 10, bottom: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: c.isDark ? c.border : c.divider,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              Flexible(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

class SheetHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  const SheetHeader({super.key, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(title,
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.36,
                      color: c.textPrimary)),
            ),
            _CloseButton(c: c),
          ],
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Text(subtitle!,
              style: AppType.mono(
                  size: 10, letterSpacing: 1.2, color: c.textMuted)),
        ],
      ],
    );
  }
}

class _CloseButton extends StatelessWidget {
  final OttoColors c;
  const _CloseButton({required this.c});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: c.surfaceMuted,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: () => Navigator.of(context).maybePop(),
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 32,
          height: 32,
          child: Icon(AppIcons.x, size: 16, color: c.textMuted),
        ),
      ),
    );
  }
}
