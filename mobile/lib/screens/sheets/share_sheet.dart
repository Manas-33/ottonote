import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/app_theme.dart';
import '../../theme/palette.dart';
import '../../widgets/app_icons.dart';
import '../../widgets/buttons.dart';
import 'sheet_shell.dart';

/// Share destinations. Mirrors ShareSheet in mobile-sheets.jsx. The OttoNote
/// integrations (Calendar/Slack/Notion) are configured elsewhere; here the
/// actions are presentational stubs so we don't imply a live connection.
Future<void> showShareSheet(BuildContext context, {required String meetingTitle}) =>
    showOttoSheet(context, builder: (_) => _ShareSheet(meetingTitle: meetingTitle));

class _Dest {
  final String name;
  final String desc;
  final IconData icon;
  final Color tint;
  const _Dest(this.name, this.desc, this.icon, this.tint);
}

class _ShareSheet extends StatelessWidget {
  final String meetingTitle;
  const _ShareSheet({required this.meetingTitle});

  static const _dests = [
    _Dest('Google Calendar', 'Attach notes to the event', AppIcons.calendar,
        Accent.sky500),
    _Dest('Slack', 'Post summary to a channel', AppIcons.hash, Accent.violet500),
    _Dest('Notion', 'Create a page in a database', AppIcons.fileText,
        Color(0xFF33332E)),
  ];

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SheetHeader(
              title: 'Share notes',
              subtitle: '$meetingTitle · summary + actions'),
          const SizedBox(height: 12),
          for (final d in _dests) ...[
            _destRow(context, c, d),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OttoButton(
                  variant: OttoButtonVariant.outline,
                  height: 48,
                  radius: 16,
                  onTap: () => _copyLink(context),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(AppIcons.link, size: 15, color: c.textPrimary),
                      const SizedBox(width: 8),
                      const Text('Copy link'),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OttoButton(
                  variant: OttoButtonVariant.ink,
                  height: 48,
                  radius: 16,
                  onTap: () => _notAvailable(context, 'System share'),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(AppIcons.share, size: 15, color: c.inkFg),
                      const SizedBox(width: 8),
                      const Text('More…'),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _destRow(BuildContext context, OttoColors c, _Dest d) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () => _notAvailable(context, d.name),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 62,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: c.border),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                    color: d.tint, borderRadius: BorderRadius.circular(12)),
                child: Icon(d.icon, size: 18, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(d.name,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.15,
                            color: c.textPrimary)),
                    const SizedBox(height: 2),
                    Text(d.desc,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: c.textMuted)),
                  ],
                ),
              ),
              Container(
                height: 26,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: c.inkBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('Connect',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: c.inkFg)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _copyLink(BuildContext context) {
    Clipboard.setData(ClipboardData(text: 'ottonote://meeting/$meetingTitle'));
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Link copied')));
  }

  void _notAvailable(BuildContext context, String what) {
    Navigator.of(context).maybePop();
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$what isn’t wired up on mobile yet')));
  }
}
