/// Error surface for backend calls. Mirrors the extension's convention
/// (`${what} failed (${status}): ${detail}`) and its UnauthorizedError.
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final String? detail;

  ApiException(this.message, {this.statusCode, this.detail});

  @override
  String toString() =>
      (detail == null || detail!.isEmpty) ? message : '$message: $detail';
}

class UnauthorizedException extends ApiException {
  UnauthorizedException([String message = 'Session expired'])
      : super(message, statusCode: 401);
}
