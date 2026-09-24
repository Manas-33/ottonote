import 'package:dio/dio.dart';

import '../models/meeting.dart';
import 'api_client.dart';

/// Wraps the /meetings endpoints. 1:1 with chrome/src/api/meetings.ts.
class MeetingsApi {
  final ApiClient _client;
  MeetingsApi(this._client);

  Dio get _dio => _client.dio;

  /// GET /meetings?workspace_id={uuid}  → lightweight rows.
  Future<List<MeetingSummary>> listMeetings({String? workspaceId}) async {
    final res = await _client.send(
      'List meetings',
      () => _dio.get(
        '/meetings',
        queryParameters:
            workspaceId == null ? null : {'workspace_id': workspaceId},
      ),
    );
    final list = (res.data as List?) ?? const [];
    return list
        .map((e) => MeetingSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// POST /meetings → 201, full Meeting (status "pending").
  Future<Meeting> createMeeting({String? title, String? workspaceId}) async {
    final res = await _client.send(
      'Create meeting',
      () => _dio.post('/meetings', data: {
        'title': title,
        'workspace_id': workspaceId,
      }),
    );
    return Meeting.fromJson(res.data as Map<String, dynamic>);
  }

  /// GET /meetings/{id} → full Meeting.
  Future<Meeting> getMeeting(String id) async {
    final res = await _client.send(
      'Load meeting',
      () => _dio.get('/meetings/$id'),
    );
    return Meeting.fromJson(res.data as Map<String, dynamic>);
  }

  /// PATCH /meetings/{id}. `speakerNames` is sent whole (server replaces).
  Future<Meeting> updateMeeting(
    String id, {
    String? title,
    String? workspaceId,
    bool clearWorkspace = false,
    Map<String, String>? speakerNames,
  }) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (clearWorkspace) {
      body['workspace_id'] = null;
    } else if (workspaceId != null) {
      body['workspace_id'] = workspaceId;
    }
    if (speakerNames != null) body['speaker_names'] = speakerNames;
    final res = await _client.send(
      'Update meeting',
      () => _dio.patch('/meetings/$id', data: body),
    );
    return Meeting.fromJson(res.data as Map<String, dynamic>);
  }

  /// DELETE /meetings/{id} → 204.
  Future<void> deleteMeeting(String id) async {
    await _client.send('Delete meeting', () => _dio.delete('/meetings/$id'));
  }

  /// POST /meetings/{id}/process → 202. multipart/form-data, field name `file`.
  /// The backend re-encodes any input to 16kHz mono WAV, so the format is
  /// flexible; the filename suffix is used for the temp file.
  Future<Meeting> processMeeting(
    String id, {
    required List<int> bytes,
    required String filename,
    String contentType = 'application/octet-stream',
    ProgressCallback? onSendProgress,
  }) async {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: DioMediaType.parse(contentType),
      ),
    });
    final res = await _client.send(
      'Process meeting',
      () => _dio.post(
        '/meetings/$id/process',
        data: form,
        onSendProgress: onSendProgress,
      ),
    );
    return Meeting.fromJson(res.data as Map<String, dynamic>);
  }

  /// DELETE /meetings/{id}/process → Meeting (status "cancelled").
  Future<Meeting> cancelMeeting(String id) async {
    final res = await _client.send(
      'Cancel meeting',
      () => _dio.delete('/meetings/$id/process'),
    );
    return Meeting.fromJson(res.data as Map<String, dynamic>);
  }

  /// POST /meetings/{id}/retry → 202, Meeting (status "processing").
  Future<Meeting> retryMeeting(String id) async {
    final res = await _client.send(
      'Retry meeting',
      () => _dio.post('/meetings/$id/retry'),
    );
    return Meeting.fromJson(res.data as Map<String, dynamic>);
  }

  /// GET /meetings/{id}/audio_url → short-lived signed URL (~3600s).
  Future<({String url, int expiresIn})> getAudioUrl(String id) async {
    final res = await _client.send(
      'Get audio URL',
      () => _dio.get('/meetings/$id/audio_url'),
    );
    final data = res.data as Map<String, dynamic>;
    return (
      url: '${data['url']}',
      expiresIn: (data['expires_in'] as num?)?.toInt() ?? 3600,
    );
  }

  /// PATCH /meetings/{id}/action_items/{itemId} → updated ActionItem.
  Future<ActionItem> toggleActionItem(
    String meetingId,
    String itemId,
    String status, // "open" | "done"
  ) async {
    final res = await _client.send(
      'Update action item',
      () => _dio.patch(
        '/meetings/$meetingId/action_items/$itemId',
        data: {'status': status},
      ),
    );
    return ActionItem.fromJson(res.data as Map<String, dynamic>);
  }
}
