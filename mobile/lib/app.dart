import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers/core_providers.dart';
import 'screens/library_screen.dart';
import 'screens/sign_in_screen.dart';
import 'theme/app_theme.dart';
import 'widgets/logo.dart';

class OttoApp extends StatelessWidget {
  const OttoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OttoNote',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: const _AuthGate(),
    );
  }
}

/// Routes on auth state: null session → Sign in, otherwise → Library.
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authSessionProvider);
    return session.when(
      loading: () => const _Splash(),
      error: (_, _) => const SignInScreen(),
      data: (s) => s == null ? const SignInScreen() : const LibraryScreen(),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    return Scaffold(
      backgroundColor: c.bg,
      body: const Center(child: Logo(size: 44)),
    );
  }
}
