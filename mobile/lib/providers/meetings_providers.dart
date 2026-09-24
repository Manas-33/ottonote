import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/meeting.dart';
import 'core_providers.dart';
import 'workspace_providers.dart';

/// Library list. Fetches for the selected workspace and silently re-polls every
/// 5s (matches Idle.tsx). Rebuilds when the selected workspace changes.
class MeetingsListNotifier extends AsyncNotifier<List<MeetingSummary>> {
  Timer? _timer;

  @override
  Future<List<MeetingSummary>> build() async {
    final wsId = ref.watch(selectedWorkspaceProvider);
    ref.onDispose(() => _timer?.cancel());
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _poll());
    return ref.read(meetingsApiProvider).listMeetings(workspaceId: wsId);
  }

  Future<void> _poll() async {
    final wsId = ref.read(selectedWorkspaceProvider);
    try {
      final rows =
          await ref.read(meetingsApiProvider).listMeetings(workspaceId: wsId);
      state = AsyncData(rows);
    } catch (_) {
      // Keep last good data on transient poll failures.
    }
  }

  /// Pull-to-refresh: keep showing current data while refetching.
  Future<void> refresh() async {
    final wsId = ref.read(selectedWorkspaceProvider);
    state =
        await AsyncValue.guard(() => ref.read(meetingsApiProvider).listMeetings(workspaceId: wsId));
  }
}

final meetingsListProvider =
    AsyncNotifierProvider<MeetingsListNotifier, List<MeetingSummary>>(
        MeetingsListNotifier.new);

/// Meeting detail. Polls every 3s while status is active (matches
/// MeetingDetail.tsx), stops on terminal. Exposes the detail mutations.
class MeetingDetailNotifier extends FamilyAsyncNotifier<Meeting, String> {
  Timer? _timer;

  @override
  Future<Meeting> build(String id) async {
    ref.onDispose(() => _timer?.cancel());
    final m = await ref.read(meetingsApiProvider).getMeeting(id);
    _syncPolling(m.status);
    return m;
  }

  void _syncPolling(MeetingStatus status) {
    _timer?.cancel();
    if (status.isActive) {
      _timer = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
    }
  }

  Future<void> _poll() async {
    try {
      final m = await ref.read(meetingsApiProvider).getMeeting(arg);
      state = AsyncData(m);
      if (m.status.isTerminal) _timer?.cancel();
    } catch (_) {
      // Ignore transient poll errors; try again next tick.
    }
  }

  Meeting? get _current => state.valueOrNull;

  Future<void> renameTitle(String title) async {
    final updated =
        await ref.read(meetingsApiProvider).updateMeeting(arg, title: title);
    state = AsyncData(updated);
    ref.invalidate(meetingsListProvider);
  }

  Future<void> moveToWorkspace(String? workspaceId) async {
    final updated = await ref.read(meetingsApiProvider).updateMeeting(
          arg,
          workspaceId: workspaceId,
          clearWorkspace: workspaceId == null,
        );
    state = AsyncData(updated);
    ref.invalidate(meetingsListProvider);
  }

  /// Sends the *entire* speaker_names map (server replaces wholesale).
  Future<void> renameSpeaker(String label, String name) async {
    final current = _current;
    if (current == null) return;
    final names = Map<String, String>.from(current.speakerNames);
    if (name.trim().isEmpty) {
      names[label] = ''; // empty string clears an override
    } else {
      names[label] = name.trim();
    }
    final updated = await ref
        .read(meetingsApiProvider)
        .updateMeeting(arg, speakerNames: names);
    state = AsyncData(updated);
  }

  /// Optimistic toggle, reconciled with the server's returned item.
  Future<void> toggleActionItem(ActionItem item) async {
    final current = _current;
    if (current == null) return;
    final next = item.isDone ? 'open' : 'done';
    state = AsyncData(current.copyWith(
      actionItems: [
        for (final a in current.actionItems)
          a.id == item.id ? a.copyWith(status: next) : a,
      ],
    ));
    try {
      final saved = await ref
          .read(meetingsApiProvider)
          .toggleActionItem(arg, item.id, next);
      final now = _current;
      if (now != null) {
        state = AsyncData(now.copyWith(actionItems: [
          for (final a in now.actionItems) a.id == saved.id ? saved : a,
        ]));
      }
    } catch (_) {
      // Roll back on failure.
      final now = _current;
      if (now != null) {
        state = AsyncData(now.copyWith(actionItems: [
          for (final a in now.actionItems) a.id == item.id ? item : a,
        ]));
      }
      rethrow;
    }
  }

  Future<void> retry() async {
    final updated = await ref.read(meetingsApiProvider).retryMeeting(arg);
    state = AsyncData(updated);
    _syncPolling(updated.status);
    ref.invalidate(meetingsListProvider);
  }

  Future<void> cancel() async {
    final updated = await ref.read(meetingsApiProvider).cancelMeeting(arg);
    state = AsyncData(updated);
    _syncPolling(updated.status);
    ref.invalidate(meetingsListProvider);
  }
}

final meetingDetailProvider =
    AsyncNotifierProvider.family<MeetingDetailNotifier, Meeting, String>(
        MeetingDetailNotifier.new);
