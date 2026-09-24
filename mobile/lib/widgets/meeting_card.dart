import 'package:flutter/material.dart';

import '../models/meeting.dart';
import '../models/workspace.dart';
import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../utils/format.dart';
import 'app_icons.dart';
import 'status_chip.dart';
import 'workspace_tag.dart';

/// Library meeting row. Mirrors MeetingCard in mobile-core.jsx, bound to a
/// MeetingSummary (list rows carry no preview text / speaker avatars).
class MeetingCard extends StatelessWidget {
  final MeetingSummary meeting;
  final Workspace? workspace;
  final VoidCallback onOpen;

  const MeetingCard({
    super.key,
    required this.meeting,
    required this.workspace,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final m = meeting;
    final showProgress = m.status.isActive;

    return Material(
      color: c.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: c.borderSoft),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (m.title == null || m.title!.trim().isEmpty)
                              ? 'Untitled meeting'
                              : m.title!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 15.5,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.23,
                            height: 1.25,
                            color: c.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 6),
                        _MetaRow(meeting: m),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  StatusChip.status(m.status),
                ],
              ),
              if (showProgress) ...[
                const SizedBox(height: 12),
                _ProgressRow(percent: m.progressStep.percent),
              ],
              if (workspace != null) ...[
                const SizedBox(height: 12),
                WorkspaceTag(
                  name: workspace!.name,
                  dotColor: workspace!.dotColor,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final MeetingSummary meeting;
  const _MetaRow({required this.meeting});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final style = AppType.mono(
      size: 10.5,
      letterSpacing: 0.84,
      color: c.textMuted,
      weight: FontWeight.w500,
    );
    Widget dot() => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Container(
            width: 4,
            height: 4,
            decoration: BoxDecoration(
              color: c.isDark ? Paper.p700 : Paper.p300,
              shape: BoxShape.circle,
            ),
          ),
        );
    return DefaultTextStyle(
      style: style,
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(Fmt.dateWithTime(meeting.createdAt).toUpperCase(), style: style),
          dot(),
          Text(Fmt.duration(meeting.durationSec).toUpperCase(), style: style),
          if (meeting.numSpeakers != null) ...[
            dot(),
            Icon(AppIcons.users, size: 11, color: c.textMuted),
            const SizedBox(width: 4),
            Text('${meeting.numSpeakers}', style: style),
          ],
        ],
      ),
    );
  }
}

class _ProgressRow extends StatelessWidget {
  final int percent;
  const _ProgressRow({required this.percent});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: Container(
              height: 6,
              color: c.isDark ? Paper.p800 : Paper.p200,
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: (percent / 100).clamp(0.0, 1.0),
                child: Container(color: Flame.f500),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '$percent%',
          style: AppType.mono(
            size: 9.5,
            letterSpacing: 0.95,
            color: c.flameText,
            weight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
