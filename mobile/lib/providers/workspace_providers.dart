import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/workspace.dart';
import 'core_providers.dart';

/// Loads workspaces (default first). The GET auto-creates the default row.
final workspacesProvider = FutureProvider<List<Workspace>>(
  (ref) => ref.watch(workspacesApiProvider).listWorkspaces(),
);

const _selectedKey = 'ottonote/selected-workspace';

/// Selected workspace id; null = "All workspaces". Persisted across launches.
class SelectedWorkspaceNotifier extends Notifier<String?> {
  @override
  String? build() {
    _load();
    return null;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final id = prefs.getString(_selectedKey);
    if (id != null && id.isNotEmpty) state = id;
  }

  Future<void> select(String? id) async {
    state = id;
    final prefs = await SharedPreferences.getInstance();
    if (id == null) {
      await prefs.remove(_selectedKey);
    } else {
      await prefs.setString(_selectedKey, id);
    }
  }
}

final selectedWorkspaceProvider =
    NotifierProvider<SelectedWorkspaceNotifier, String?>(
        SelectedWorkspaceNotifier.new);

/// Convenience: the currently-selected Workspace object, if resolvable.
final selectedWorkspaceObjectProvider = Provider<Workspace?>((ref) {
  final id = ref.watch(selectedWorkspaceProvider);
  if (id == null) return null;
  final list = ref.watch(workspacesProvider).valueOrNull;
  if (list == null) return null;
  for (final w in list) {
    if (w.id == id) return w;
  }
  return null;
});
