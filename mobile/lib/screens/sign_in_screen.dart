import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../providers/core_providers.dart';
import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../widgets/app_icons.dart';
import '../widgets/buttons.dart';
import '../widgets/google_g.dart';
import '../widgets/logo.dart';

/// 01 · Sign in. Google + email; email/password is the live path (Google OAuth
/// mirrors the extension's Supabase flow and needs project redirect config).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _emailMode = false;
  bool _signUp = false;
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      await action();
      // On success, authSessionProvider updates and the gate swaps screens.
    } catch (e) {
      if (mounted) setState(() => _error = _friendly(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Email sign-in or sign-up. On sign-up, Supabase may require email
  /// confirmation (no session returned) — surface that instead of erroring.
  Future<void> _submitEmail() async {
    final auth = ref.read(authServiceProvider);
    final email = _email.text.trim();
    final password = _password.text;
    if (_signUp) {
      await _run(() async {
        final res = await auth.signUp(email: email, password: password);
        if (res.session == null && mounted) {
          setState(() => _info =
              'Account created. Check $email to confirm, then sign in.');
        }
      });
    } else {
      await _run(() =>
          auth.signInWithPassword(email: email, password: password));
    }
  }

  String _friendly(Object e) {
    final s = e.toString().replaceFirst('AuthException: ', '');
    return s.replaceFirst('Exception: ', '');
  }

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    final configured = AppConfig.hasSupabase;

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    children: [
                      Expanded(child: _hero(c)),
                      if (!configured) _configHint(c),
                      _authStack(c, configured),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _hero(OttoColors c) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 150,
            height: 150,
            child: Stack(
              alignment: Alignment.center,
              children: [
                _ring(146, c.border),
                _ring(106, c.border),
                const Logo(size: 58),
              ],
            ),
          ),
          const SizedBox(height: 36),
          Text('○ WELCOME',
              style: AppType.mono(
                  size: 10.5, letterSpacing: 2.1, color: c.flameText)),
          const SizedBox(height: 12),
          Text('OttoNote',
              style: TextStyle(
                  fontSize: 34,
                  height: 1,
                  letterSpacing: -1.0,
                  fontWeight: FontWeight.w600,
                  color: c.textPrimary)),
          const SizedBox(height: 16),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 280),
            child: Text(
              'Quiet notes for real-life meetings. Hit record, walk away with a transcript, summary, and action items.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 14.5, height: 1.55, color: c.textSecondary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _ring(double size, Color color) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: color),
        ),
      );

  Widget _configHint(OttoColors c) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: amberTint(c.isDark).bg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'Auth is not configured. Run with --dart-define SUPABASE_URL and '
          'SUPABASE_ANON_KEY (see tool/run_dev.sh).',
          style: TextStyle(fontSize: 12, height: 1.4, color: amberTint(c.isDark).fg),
        ),
      );

  Widget _authStack(OttoColors c, bool configured) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_error != null) ...[
            _errorBox(c, _error!),
            const SizedBox(height: 10),
          ],
          if (_info != null) ...[
            _infoBox(c, _info!),
            const SizedBox(height: 10),
          ],
          if (!_emailMode) ...[
            OttoButton(
              variant: OttoButtonVariant.ink,
              onTap: !configured || _busy
                  ? null
                  : () => _run(() =>
                      ref.read(authServiceProvider).signInWithGoogle()),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Center(child: GoogleG(size: 16)),
                  ),
                  const SizedBox(width: 12),
                  const Text('Continue with Google'),
                ],
              ),
            ),
            const SizedBox(height: 10),
            OttoButton(
              variant: OttoButtonVariant.outline,
              onTap: !configured || _busy
                  ? null
                  : () => setState(() => _emailMode = true),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(AppIcons.mail, size: 16, color: c.textPrimary),
                  const SizedBox(width: 10),
                  const Text('Continue with email'),
                ],
              ),
            ),
          ] else
            _emailForm(c),
          const SizedBox(height: 22),
          _trustFooter(c),
          const SizedBox(height: 6),
          _terms(c),
        ],
      ),
    );
  }

  Widget _emailForm(OttoColors c) {
    return Column(
      children: [
        _field(c, controller: _email, hint: 'you@work.com', icon: AppIcons.mail),
        const SizedBox(height: 10),
        _field(c,
            controller: _password,
            hint: 'Password',
            icon: AppIcons.lock,
            obscure: true),
        const SizedBox(height: 10),
        OttoButton(
          variant: OttoButtonVariant.ink,
          onTap: _busy ? null : _submitEmail,
          child: _busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : Text(_signUp ? 'Create account' : 'Sign in'),
        ),
        const SizedBox(height: 6),
        TextButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                    _signUp = !_signUp;
                    _error = null;
                    _info = null;
                  }),
          child: Text(
            _signUp
                ? 'Have an account? Sign in'
                : 'New to OttoNote? Create an account',
            style: const TextStyle(fontSize: 13, color: Flame.f600, fontWeight: FontWeight.w500),
          ),
        ),
        TextButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                    _emailMode = false;
                    _signUp = false;
                  }),
          child: Text('Use another method',
              style: TextStyle(fontSize: 13, color: c.textMuted)),
        ),
      ],
    );
  }

  Widget _field(
    OttoColors c, {
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      style: TextStyle(fontSize: 15, color: c.textPrimary),
      cursorColor: Flame.f500,
      keyboardType:
          obscure ? TextInputType.text : TextInputType.emailAddress,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: c.textMuted, fontSize: 15),
        prefixIcon: Icon(icon, size: 16, color: c.textMuted),
        filled: true,
        fillColor: Colors.transparent,
        contentPadding: const EdgeInsets.symmetric(vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Flame.f500, width: 1.5),
        ),
      ),
    );
  }

  Widget _errorBox(OttoColors c, String msg) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: redTint(c.isDark).bg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(msg,
            style:
                TextStyle(fontSize: 13, height: 1.4, color: redTint(c.isDark).fg)),
      );

  Widget _infoBox(OttoColors c, String msg) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: emeraldTint(c.isDark).bg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(msg,
            style: TextStyle(
                fontSize: 13, height: 1.4, color: emeraldTint(c.isDark).fg)),
      );

  Widget _trustFooter(OttoColors c) => FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(AppIcons.lock, size: 11, color: c.textFaint),
          const SizedBox(width: 6),
          Text('END-TO-END ENCRYPTED',
              style: AppType.mono(
                  size: 10, letterSpacing: 1.4, color: c.textFaint)),
          const SizedBox(width: 8),
          Container(
              width: 4,
              height: 4,
              decoration:
                  BoxDecoration(color: c.textFaint, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text('YOU OWN YOUR DATA',
              style: AppType.mono(
                  size: 10, letterSpacing: 1.4, color: c.textFaint)),
        ],
        ),
      );

  Widget _terms(OttoColors c) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'By continuing you agree to the '),
            TextSpan(
                text: 'Terms',
                style: TextStyle(decoration: TextDecoration.underline, color: c.textMuted)),
            const TextSpan(text: ' & '),
            TextSpan(
                text: 'Privacy Policy',
                style: TextStyle(decoration: TextDecoration.underline, color: c.textMuted)),
            const TextSpan(text: '.'),
          ]),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11, height: 1.5, color: c.textFaint),
        ),
      );
}
