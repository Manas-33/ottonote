import 'package:dio/dio.dart';

import '../models/workspace.dart';
import 'api_client.dart';

/// Wraps the /workspaces endpoints. 1:1 with chrome/src/api/workspaces.ts.
class WorkspacesApi {
  final ApiClient _client;
  WorkspacesApi(this._client);

  Dio get _dio => _client.dio;

  /// GET /workspaces → default first, then by created_at asc. The backend
  /// auto-creates the default workspace as a side effect of this call.
  Future<List<Workspace>> listWorkspaces() async {
    final res =
        await _client.send('List workspaces', () => _dio.get('/workspaces'));
    final list = (res.data as List?) ?? const [];
    return list
        .map((e) => Workspace.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// POST /workspaces → 201.
  Future<Workspace> createWorkspace(String name, {String color = 'slate'}) async {
    final res = await _client.send(
      'Create workspace',
      () => _dio.post('/workspaces', data: {'name': name, 'color': color}),
    );
    return Workspace.fromJson(res.data as Map<String, dynamic>);
  }

  /// PATCH /workspaces/{id}.
  Future<Workspace> updateWorkspace(String id, {String? name, String? color}) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (color != null) body['color'] = color;
    final res = await _client.send(
      'Update workspace',
      () => _dio.patch('/workspaces/$id', data: body),
    );
    return Workspace.fromJson(res.data as Map<String, dynamic>);
  }

  /// DELETE /workspaces/{id} → 204. Default workspace cannot be deleted (409).
  Future<void> deleteWorkspace(String id) async {
    await _client.send(
        'Delete workspace', () => _dio.delete('/workspaces/$id'));
  }
}
