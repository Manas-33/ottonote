import 'package:flutter/foundation.dart';

/// App configuration, supplied at build/run time via --dart-define.
///
/// Mirrors the Chrome extension's env contract (chrome/src/config.ts):
///   API_BASE_URL       ← VITE_API_BASE_URL   (no /api prefix; endpoints mount at root)
///   SUPABASE_URL       ← VITE_SUPABASE_URL
///   SUPABASE_ANON_KEY  ← VITE_SUPABASE_ANON_KEY  (public client key by design)
///
/// Secrets are never committed — pass them at run time. See tool/run_dev.sh.
class AppConfig {
  const AppConfig._();

  static const String _rawApiBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8000');

  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// True once Supabase auth is configured; when false the app runs in a
  /// clearly-degraded state (sign-in disabled with a config hint) rather than
  /// crashing at startup.
  static bool get hasSupabase =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  /// Android emulators reach the host machine at 10.0.2.2, not localhost.
  /// Web/desktop/iOS-sim all use localhost as-is.
  static String get apiBaseUrl {
    if (!kIsWeb &&
        defaultTargetPlatform == TargetPlatform.android &&
        (_rawApiBaseUrl.contains('localhost') ||
            _rawApiBaseUrl.contains('127.0.0.1'))) {
      return _rawApiBaseUrl
          .replaceFirst('localhost', '10.0.2.2')
          .replaceFirst('127.0.0.1', '10.0.2.2');
    }
    return _rawApiBaseUrl;
  }
}
