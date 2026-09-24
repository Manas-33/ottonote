import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import '../providers/meetings_providers.dart';

/// Lifecycle of a just-recorded capture: create the meeting, upload the audio
/// (multipart), then hand off to status polling. Folds the "Uploading audio"
/// step into the Processing screen, matching the mobile design.
sealed class CaptureState {
  const CaptureState();
}

class CaptureIdle extends CaptureState {
  const CaptureIdle();
}

class CaptureUploading extends CaptureState {
  final double progress; // 0..1
  const CaptureUploading(this.progress);
}

class CaptureProcessing extends CaptureState {
  final String meetingId;
  const CaptureProcessing(this.meetingId);
}

class CaptureFailed extends CaptureState {
  final String message;
  const CaptureFailed(this.message);
}

class CaptureController extends Notifier<CaptureState> {
  @override
  CaptureState build() => const CaptureIdle();

  Future<void> run({
    required List<int> bytes,
    required String filename,
    String? title,
    String? workspaceId,
    String contentType = 'audio/m4a',
  }) async {
    state = const CaptureUploading(0);
    final api = ref.read(meetingsApiProvider);
    try {
      final created =
          await api.createMeeting(title: title, workspaceId: workspaceId);
      final processed = await api.processMeeting(
        created.id,
        bytes: bytes,
        filename: filename,
        contentType: contentType,
        onSendProgress: (sent, total) {
          if (total > 0) state = CaptureUploading(sent / total);
        },
      );
      ref.invalidate(meetingsListProvider);
      state = CaptureProcessing(processed.id);
    } catch (e) {
      state = CaptureFailed(e.toString());
    }
  }

  void reset() => state = const CaptureIdle();
}

final captureControllerProvider =
    NotifierProvider<CaptureController, CaptureState>(CaptureController.new);
