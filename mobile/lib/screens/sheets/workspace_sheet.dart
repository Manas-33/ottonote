import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/workspace.dart';
import '../../providers/core_providers.dart';
import '../../providers/meetings_providers.dart';
import '../../providers/workspace_providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_icons.dart';
import 'sheet_shell.dart';

/// Workspace picker. Mirrors WorkspaceSheet in mobile-sheets.jsx, bound to
/// live workspaces with an "All workspaces" option and inline create.
Future<void> showWorkspaceSheet(BuildContext context) =>
    showOttoSheet(context, builder: (_) => const _WorkspaceSheet());

class _WorkspaceSheet extends ConsumerWidget {
  const _WorkspaceSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = OttoColors.of(context);
    final selectedId = ref.watch(selectedWorkspaceProvider);
    final workspaces = ref.watch(workspacesProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SheetHeader(title: 'Workspace'),
          const SizedBox(height: 12),
          Flexible(
            child: workspaces.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text('Couldn’t load workspaces.\n$e',
                    style: TextStyle(color: c.textMuted, fontSize: 13)),
              ),
              data: (list) => ListView(
                shrinkWrap: true,
                children: [
                  _row(
                    context,
                    ref,
                    icon: AppIcons.folder,
                    color: c.textMuted,
                    name: 'All workspaces',
                    sub: 'Everything',
                    selected: selectedId == null,
                    onTap: () => _select(context, ref, null),
                  ),
                  for (final w in list)
                    _row(
                      context,
                      ref,
                      icon: AppIcons.folder,
                      color: w.dotColor,
                      name: w.name,
                      sub: w.isDefault ? 'Default' : w.color.toUpperCase(),
                      selected: selectedId == w.id,
                      onTap: () => _select(context, ref, w.id),
                    ),
                  const SizedBox(height: 12),
                  _newWorkspaceButton(context, ref, c),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _select(BuildContext context, WidgetRef ref, String? id) {
    ref.read(selectedWorkspaceProvider.notifier).select(id);
    Navigator.of(context).maybePop();
  }

  Widget _row(
    BuildContext context,
    WidgetRef ref, {
    required IconData icon,
    required Color color,
    required String name,
    required String sub,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final c = OttoColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: selected
            ? c.flameTint
            : (c.isDark ? c.bg : Colors.transparent),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                  color: selected ? c.flameTintBorder : c.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(name,
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.15,
                              color: c.textPrimary)),
                      const SizedBox(height: 2),
                      Text(sub.toUpperCase(),
                          style: AppType.mono(
                              size: 10,
                              letterSpacing: 1.2,
                              color: c.textMuted)),
                    ],
                  ),
                ),
                if (selected)
                  Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                        color: Color(0xFFFF5310), shape: BoxShape.circle),
                    child: const Icon(AppIcons.check, size: 13, color: Colors.white),
                  )
                else
                  Icon(AppIcons.chevronRight, size: 18, color: c.textFaint),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _newWorkspaceButton(BuildContext context, WidgetRef ref, OttoColors c) {
    return InkWell(
      onTap: () => _createWorkspace(context, ref),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: c.isDark ? c.border : c.divider,
              style: BorderStyle.solid),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(AppIcons.plus, size: 16, color: c.textSecondary),
            const SizedBox(width: 8),
            Text('New workspace',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: c.textSecondary)),
          ],
        ),
      ),
    );
  }

  Future<void> _createWorkspace(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final c = OttoColors.of(context);
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.bg,
        title: Text('New workspace',
            style: TextStyle(color: c.textPrimary, fontSize: 17)),
        content: TextField(
          controller: controller,
          autofocus: true,
          cursorColor: const Color(0xFFFF5310),
          style: TextStyle(color: c.textPrimary),
          decoration: const InputDecoration(hintText: 'e.g. Product'),
          onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
              child: const Text('Create')),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      final ws = await ref
          .read(workspacesApiProvider)
          .createWorkspace(name, color: kWorkspaceColors[1]);
      ref.invalidate(workspacesProvider);
      ref.read(selectedWorkspaceProvider.notifier).select(ws.id);
      ref.invalidate(meetingsListProvider);
      if (context.mounted) Navigator.of(context).maybePop();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Couldn’t create workspace: $e')));
      }
    }
  }
}
