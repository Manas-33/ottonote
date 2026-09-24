import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Auth against the Supabase project (the backend only verifies tokens).
/// supabase_flutter handles secure token storage + background refresh; we add
/// the extension's 60s-skew proactive refresh on the request path.
class AuthService {
  final SupabaseClient client;
  AuthService(this.client);

  Session? get currentSession => client.auth.currentSession;
  User? get currentUser => client.auth.currentUser;
  String? get email => client.auth.currentUser?.email;

  Stream<AuthState> get onAuthStateChange => client.auth.onAuthStateChange;

  Future<void> signInWithPassword({
    required String email,
    required String password,
  }) =>
      client.auth.signInWithPassword(email: email, password: password);

  Future<AuthResponse> signUp({
    required String email,
    required String password,
  }) =>
      client.auth.signUp(email: email, password: password);

  /// Browser-redirect Google OAuth via Supabase. Requires the Supabase project
  /// to whitelist the redirect + a platform deep link. (The extension's own
  /// Google button is stubbed today; email/password is the live path.)
  Future<bool> signInWithGoogle() => client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: kIsWeb ? null : 'ottonote://login-callback',
      );

  Future<void> signOut() => client.auth.signOut();

  /// A valid access token, refreshing proactively within 60s of expiry
  /// (REFRESH_SKEW_MS in chrome/src/auth/session.ts). Signs out + returns null
  /// if refresh fails, forcing re-login.
  Future<String?> freshAccessToken() async {
    final auth = client.auth;
    var session = auth.currentSession;
    if (session == null) return null;
    final expiresAt = session.expiresAt; // epoch seconds
    if (expiresAt != null) {
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      if (nowMs > expiresAt * 1000 - 60000) {
        try {
          final res = await auth.refreshSession();
          session = res.session ?? session;
        } catch (_) {
          await auth.signOut();
          return null;
        }
      }
    }
    return session.accessToken;
  }
}
