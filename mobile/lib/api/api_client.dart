import 'package:dio/dio.dart';

import 'api_exception.dart';

typedef TokenProvider = Future<String?> Function();
typedef UnauthorizedHandler = Future<void> Function();

/// Thin HTTP core over the FastAPI backend. Reproduces chrome/src/api/client.ts:
/// attaches `Authorization: Bearer <jwt>` to every request, and on any 401
/// clears the session (via [onUnauthorized]) and throws [UnauthorizedException].
class ApiClient {
  final Dio dio;

  ApiClient({
    required String baseUrl,
    required TokenProvider tokenProvider,
    required UnauthorizedHandler onUnauthorized,
  }) : dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 90),
          // Upload can be large; give the send generous headroom.
          sendTimeout: const Duration(minutes: 5),
        )) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await tokenProvider();
        if (token == null) {
          handler.reject(DioException(
            requestOptions: options,
            error: UnauthorizedException('Not signed in'),
            type: DioExceptionType.cancel,
          ));
          return;
        }
        options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (e, handler) async {
        if (e.response?.statusCode == 401 && e.error is! UnauthorizedException) {
          await onUnauthorized();
          handler.reject(DioException(
            requestOptions: e.requestOptions,
            response: e.response,
            error: UnauthorizedException(),
            type: e.type,
          ));
          return;
        }
        handler.next(e);
      },
    ));
  }

  Future<Response<dynamic>> send(
    String what,
    Future<Response<dynamic>> Function() run,
  ) async {
    try {
      return await run();
    } on DioException catch (e) {
      final err = e.error;
      if (err is UnauthorizedException) throw err;
      final status = e.response?.statusCode;
      if (status == 401) throw UnauthorizedException();
      throw ApiException(
        '$what failed (${status ?? 'network error'})',
        statusCode: status,
        detail: _extractDetail(e),
      );
    }
  }

  /// FastAPI errors are usually `{"detail": "..."}`; fall back to raw text.
  String? _extractDetail(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['detail'] != null) {
      final d = data['detail'];
      return d is String ? _clip(d) : _clip('$d');
    }
    if (data is String && data.isNotEmpty) return _clip(data);
    return _clip(e.message ?? '');
  }

  String? _clip(String s) => s.isEmpty ? null : (s.length > 200 ? s.substring(0, 200) : s);
}
