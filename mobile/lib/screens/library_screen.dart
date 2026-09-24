import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../models/meeting.dart';
import '../models/workspace.dart';
import '../providers/core_providers.dart';
import '../providers/meetings_providers.dart';
import '../providers/workspace_providers.dart';
import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../utils/format.dart';
import '../widgets/app_icons.dart';
import '../widgets/meeting_card.dart';
import '../widgets/record_button.dart';
import 'meeting_detail_screen.dart';
import 'recording_screen.dart';
import 'sheets/workspace_sheet.dart';

/// 02 · Library / Home. The hub: workspace picker, pull-to-refresh list, docked
/// record pill. Mirrors Idle.tsx (5s list poll comes from the provider).
class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = OttoColors.of(context);
    final meetings = ref.watch(meetingsListProvider);
    final selectedWs = ref.watch(selectedWorkspaceObjectProvider);
    final workspaces = ref.watch(workspacesProvider).valueOrNull ?? const [];
    final wsById = {for (final w in workspaces) w.id: w};

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Header(selectedWs: selectedWs),
                Expanded(
                  child: RefreshIndicator(
                    color: Flame.f500,
                    backgroundColor: c.bg,
                    onRefresh: () =>
                        ref.read(meetingsListProvider.notifier).refresh(),
                    child: meetings.when(
                      loading: () => _loading(),
                      error: (e, _) => _error(context, ref, c, e),
                      data: (rows) => rows.isEmpty
                          ? _empty(c)
                          : _list(context, c, rows, wsById),
                    ),
                  ),
                ),
              ],
            ),
            _DockedRecord(
              onRecord: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const RecordingScreen()),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list(BuildContext context, OttoColors c, List<MeetingSummary> rows,
      Map<String, Workspace> wsById) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(AppIcons.arrowDown, size: 11, color: c.textFaint),
                const SizedBox(width: 6),
                Text('PULL TO REFRESH',
                    style: AppType.mono(
                        size: 9.5, letterSpacing: 1.6, color: c.textFaint)),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 10),
          child: Row(
            children: [
              Text('RECENT',
                  style: AppType.mono(
                      size: 10, letterSpacing: 1.6, color: c.textMuted)),
              const SizedBox(width: 10),
              Expanded(child: Container(height: 1, color: c.border)),
            ],
          ),
        ),
        for (final m in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: MeetingCard(
              meeting: m,
              workspace: m.workspaceId == null ? null : wsById[m.workspaceId],
              onOpen: () => Navigator.of(context).push(
                MaterialPageRoute(
                    builder: (_) => MeetingDetailScreen(meetingId: m.id)),
              ),
            ),
          ),
      ],
    );
  }

  Widget _loading() => const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 80),
          child: CircularProgressIndicator(),
        ),
      );

  Widget _empty(OttoColors c) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 120),
          Icon(AppIcons.mic, size: 34, color: c.textFaint),
          const SizedBox(height: 16),
          Center(
            child: Text('No meetings yet',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: c.textPrimary)),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text('Hit record to capture your first meeting.',
                style: TextStyle(fontSize: 13.5, color: c.textSecondary)),
          ),
        ],
      );

  Widget _error(
          BuildContext context, WidgetRef ref, OttoColors c, Object e) =>
      ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 100),
          Icon(AppIcons.alertTriangle, size: 30, color: c.textMuted),
          const SizedBox(height: 14),
          Center(
              child: Text('Couldn’t load your meetings',
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: c.textPrimary))),
          const SizedBox(height: 6),
          Center(
              child: Text('$e',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12.5, color: c.textMuted))),
          const SizedBox(height: 10),
          Center(
              child: Text('Backend: ${AppConfig.apiBaseUrl}',
                  textAlign: TextAlign.center,
                  style: AppType.mono(size: 10.5, letterSpacing: 0.5, color: c.textFaint))),
          const SizedBox(height: 4),
          Center(
              child: Text('Make sure the OttoNote backend is running there.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: c.textFaint))),
          const SizedBox(height: 16),
          Center(
            child: TextButton(
              onPressed: () => ref.invalidate(meetingsListProvider),
              child: const Text('Retry'),
            ),
          ),
        ],
      );
}

class _Header extends ConsumerWidget {
  final Workspace? selectedWs;
  const _Header({required this.selectedWs});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = OttoColors.of(context);
    final email = ref.watch(authServiceProvider).email ?? '';
    final user = ref.watch(authServiceProvider).currentUser;
    final fullName = (user?.userMetadata?['full_name'] ??
            user?.userMetadata?['name']) as String?;
    final name = _firstName(fullName, email);
    final initials = _initials(fullName, email);
    final count = ref.watch(meetingsListProvider).valueOrNull?.length ?? 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _WorkspaceChip(selectedWs: selectedWs),
              const Spacer(),
              _iconButton(c, AppIcons.search, () {}),
              const SizedBox(width: 4),
              GestureDetector(
                onTap: () => _accountMenu(context, ref, email),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration:
                      BoxDecoration(color: c.inkBg, shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: Text(initials,
                      style: AppType.mono(
                          size: 12, weight: FontWeight.w600, color: c.inkFg)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('${Fmt.greeting()}, $name.',
              style: TextStyle(
                  fontSize: 26,
                  height: 1.05,
                  letterSpacing: -0.65,
                  fontWeight: FontWeight.w600,
                  color: c.textPrimary)),
          const SizedBox(height: 6),
          Text(Fmt.todayLine(count).toUpperCase(),
              style: AppType.mono(
                  size: 10.5, letterSpacing: 1.47, color: c.textMuted)),
        ],
      ),
    );
  }

  Widget _iconButton(OttoColors c, IconData icon, VoidCallback onTap) =>
      Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
              width: 36,
              height: 36,
              child: Icon(icon, size: 18, color: c.textMuted)),
        ),
      );

  void _accountMenu(BuildContext context, WidgetRef ref, String email) {
    final c = OttoColors.of(context);
    showModalBottomSheet(
      context: context,
      backgroundColor: c.bg,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            if (email.isNotEmpty)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  children: [
                    Icon(AppIcons.mail, size: 15, color: c.textMuted),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(email,
                            style: TextStyle(
                                fontSize: 13, color: c.textSecondary))),
                  ],
                ),
              ),
            ListTile(
              leading: Icon(AppIcons.logOut, color: redTint(c.isDark).fg),
              title: Text('Sign out',
                  style: TextStyle(color: redTint(c.isDark).fg)),
              onTap: () async {
                Navigator.of(ctx).pop();
                await ref.read(authServiceProvider).signOut();
              },
            ),
          ],
        ),
      ),
    );
  }

  String _firstName(String? full, String email) {
    if (full != null && full.trim().isNotEmpty) return full.trim().split(' ').first;
    final local = email.split('@').first.replaceAll(RegExp(r'[0-9._]+'), ' ').trim();
    if (local.isEmpty) return 'there';
    final w = local.split(' ').first;
    return w[0].toUpperCase() + w.substring(1);
  }

  String _initials(String? full, String email) {
    if (full != null && full.trim().isNotEmpty) {
      final parts = full.trim().split(RegExp(r'\s+'));
      final a = parts.first.isNotEmpty ? parts.first[0] : '';
      final b = parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '';
      return (a + b).toUpperCase();
    }
    final local = email.split('@').first;
    return (local.isEmpty ? '?' : local[0]).toUpperCase();
  }
}

class _WorkspaceChip extends StatelessWidget {
  final Workspace? selectedWs;
  const _WorkspaceChip({required this.selectedWs});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final name = selectedWs?.name ?? 'All workspaces';
    final dot = selectedWs?.dotColor ?? c.textMuted;
    return Material(
      color: c.card,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => showWorkspaceSheet(context),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 36,
          padding: const EdgeInsets.only(left: 10, right: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: c.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text(name,
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.14,
                      color: c.textPrimary)),
              const SizedBox(width: 4),
              Icon(AppIcons.chevronsUpDown, size: 14, color: c.textFaint),
            ],
          ),
        ),
      ),
    );
  }
}

class _DockedRecord extends StatelessWidget {
  final VoidCallback onRecord;
  const _DockedRecord({required this.onRecord});

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IgnorePointer(
            child: Container(
              height: 96,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [c.bg, c.bg.withValues(alpha: 0)],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 28, top: 0),
            child: Material(
              color: c.inkBg,
              borderRadius: BorderRadius.circular(999),
              elevation: 12,
              shadowColor: Colors.black.withValues(alpha: 0.45),
              child: InkWell(
                onTap: onRecord,
                borderRadius: BorderRadius.circular(999),
                child: Container(
                  height: 60,
                  padding: const EdgeInsets.only(left: 8, right: 24),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const RecordButton(size: 48),
                      const SizedBox(width: 12),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Record meeting',
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: -0.15,
                                  color: c.inkFg)),
                          const SizedBox(height: 4),
                          Text('IN PERSON · TAP TO START',
                              style: AppType.mono(
                                  size: 10,
                                  letterSpacing: 1.4,
                                  color: c.inkFg.withValues(alpha: 0.55))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
