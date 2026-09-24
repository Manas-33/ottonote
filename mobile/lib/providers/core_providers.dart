import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../api/api_client.dart';
import '../api/meetings_api.dart';
import '../api/workspaces_api.dart';
import '../auth/auth_service.dart';
import '../config.dart';

/// Whether Supabase.initialize() succeeded. Overridden in main().
final supabaseReadyProvider = Provider<bool>((_) => false);

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(Supabase.instance.client),
);

/// Emits the current auth session and every subsequent change. Drives routing
/// (null → Sign in). Yields null when Supabase isn't configured.
final authSessionProvider = StreamProvider<Session?>((ref) async* {
  if (!ref.watch(supabaseReadyProvider)) {
    yield null;
    return;
  }
  final auth = ref.watch(authServiceProvider);
  yield auth.currentSession;
  yield* auth.onAuthStateChange.map((e) => e.session);
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final auth = ref.watch(authServiceProvider);
  return ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenProvider: auth.freshAccessToken,
    onUnauthorized: auth.signOut,
  );
});

final meetingsApiProvider =
    Provider<MeetingsApi>((ref) => MeetingsApi(ref.watch(apiClientProvider)));

final workspacesApiProvider = Provider<WorkspacesApi>(
    (ref) => WorkspacesApi(ref.watch(apiClientProvider)));
