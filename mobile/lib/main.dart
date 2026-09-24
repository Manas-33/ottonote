import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'providers/core_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  var ready = false;
  if (AppConfig.hasSupabase) {
    try {
      await Supabase.initialize(
        url: AppConfig.supabaseUrl,
        anonKey: AppConfig.supabaseAnonKey,
      );
      ready = true;
    } catch (_) {
      ready = false;
    }
  }

  runApp(
    ProviderScope(
      overrides: [supabaseReadyProvider.overrideWithValue(ready)],
      child: const OttoApp(),
    ),
  );
}
