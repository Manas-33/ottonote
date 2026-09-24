import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'palette.dart';

/// A resolved (bg, fg) pair for a tinted chip/badge.
class Tint {
  final Color bg;
  final Color fg;
  const Tint(this.bg, this.fg);
}

/// Semantic color tokens for OttoNote, resolved per brightness. Mirrors the
/// paper/flame usage across the mockups (light values + their `dark:` variants).
@immutable
class OttoColors extends ThemeExtension<OttoColors> {
  final Brightness brightness;
  final Color bg;
  final Color card;
  final Color surfaceMuted;
  final Color border;
  final Color borderSoft;
  final Color divider;
  final Color textPrimary;
  final Color textSecondary;
  final Color textBody;
  final Color textMuted;
  final Color textFaint;
  final Color inkBg;
  final Color inkFg;
  final Color flame;
  final Color flameText;
  final Color flameStrongText;
  final Color flameSoftBg;
  final Color flameSoftBorder;
  final Color flameTint;
  final Color flameTintBorder;
  final Color scrim;

  const OttoColors({
    required this.brightness,
    required this.bg,
    required this.card,
    required this.surfaceMuted,
    required this.border,
    required this.borderSoft,
    required this.divider,
    required this.textPrimary,
    required this.textSecondary,
    required this.textBody,
    required this.textMuted,
    required this.textFaint,
    required this.inkBg,
    required this.inkFg,
    required this.flame,
    required this.flameText,
    required this.flameStrongText,
    required this.flameSoftBg,
    required this.flameSoftBorder,
    required this.flameTint,
    required this.flameTintBorder,
    required this.scrim,
  });

  bool get isDark => brightness == Brightness.dark;

  static const light = OttoColors(
    brightness: Brightness.light,
    bg: Paper.p50,
    card: Paper.p50,
    surfaceMuted: Paper.p100,
    border: Paper.p200,
    borderSoft: Color(0xCCE3E2D9), // paper-200/80
    divider: Color(0xB3C8C6B9), // paper-300/70
    textPrimary: Paper.p900,
    textSecondary: Paper.p600,
    textBody: Paper.p700,
    textMuted: Paper.p500,
    textFaint: Paper.p400,
    inkBg: Paper.p900,
    inkFg: Paper.p50,
    flame: Flame.f500,
    flameText: Flame.f600,
    flameStrongText: Flame.f700,
    flameSoftBg: Color(0xB3FFE5D4), // flame-100/70
    flameSoftBorder: Color(0x99FFC6A8), // flame-200/60
    flameTint: Color(0x99FFE5D4), // flame-100/60
    flameTintBorder: Color(0xB3FFC6A8), // flame-200/70
    scrim: Color(0x66141413), // paper-950/40
  );

  static final dark = OttoColors(
    brightness: Brightness.dark,
    bg: Paper.p950,
    card: Paper.p900.withValues(alpha: 0.4),
    surfaceMuted: Paper.p900,
    border: Paper.p800,
    borderSoft: Paper.p800,
    divider: Paper.p800,
    textPrimary: Paper.p50,
    textSecondary: Paper.p300,
    textBody: Paper.p300,
    textMuted: Paper.p400,
    textFaint: Paper.p500,
    inkBg: Paper.p100,
    inkFg: Paper.p900,
    flame: Flame.f500,
    flameText: Flame.f400,
    flameStrongText: Flame.f400,
    flameSoftBg: Flame.f900.withValues(alpha: 0.30),
    flameSoftBorder: Flame.f800.withValues(alpha: 0.40),
    flameTint: Flame.f900.withValues(alpha: 0.20),
    flameTintBorder: Flame.f900.withValues(alpha: 0.40),
    scrim: Colors.black.withValues(alpha: 0.60),
  );

  static OttoColors of(BuildContext context) =>
      Theme.of(context).extension<OttoColors>()!;

  @override
  OttoColors copyWith() => this;

  @override
  OttoColors lerp(ThemeExtension<OttoColors>? other, double t) {
    if (other is! OttoColors) return this;
    return t < 0.5 ? this : other;
  }
}

/// Badge/chip tints resolved by brightness (emerald/amber/red/flame).
Tint emeraldTint(bool dark) => dark
    ? Tint(Accent.emerald900.withValues(alpha: 0.40), Accent.emerald300)
    : const Tint(Accent.emerald100, Accent.emerald800);
Tint amberTint(bool dark) => dark
    ? Tint(Accent.amber900.withValues(alpha: 0.40), Accent.amber300)
    : const Tint(Accent.amber100, Accent.amber800);
Tint redTint(bool dark) => dark
    ? Tint(Accent.red900.withValues(alpha: 0.40), Accent.red300)
    : const Tint(Accent.red100, Accent.red800);
Tint flameChipTint(bool dark) => dark
    ? Tint(Flame.f900.withValues(alpha: 0.40), Flame.f300)
    : Tint(Flame.f100, Flame.f800);

/// Typography — Geist for text, Geist Mono for the many mono labels/timestamps.
class AppType {
  const AppType._();

  static TextTheme textTheme(Brightness b) {
    final base = b == Brightness.dark
        ? Typography.material2021().white
        : Typography.material2021().black;
    return GoogleFonts.geistTextTheme(base);
  }

  /// Geist Mono style. Used everywhere the design sets font-mono (uppercase
  /// tracked labels, tabular timestamps, counters).
  static TextStyle mono({
    double size = 10,
    FontWeight weight = FontWeight.w500,
    double letterSpacing = 0.14 * 10,
    Color? color,
    double? height,
  }) {
    return GoogleFonts.geistMono(
      fontSize: size,
      fontWeight: weight,
      letterSpacing: letterSpacing,
      color: color,
      height: height,
      textBaseline: TextBaseline.alphabetic,
    );
  }
}

class AppTheme {
  const AppTheme._();

  static ThemeData _base(OttoColors c) {
    final scheme = ColorScheme.fromSeed(
      seedColor: Flame.f500,
      brightness: c.brightness,
    ).copyWith(surface: c.bg);
    return ThemeData(
      useMaterial3: true,
      brightness: c.brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.bg,
      splashFactory: InkSparkle.splashFactory,
      textTheme: AppType.textTheme(c.brightness).apply(
        bodyColor: c.textPrimary,
        displayColor: c.textPrimary,
      ),
      textSelectionTheme: const TextSelectionThemeData(
        selectionColor: Color(0x66FFC6A8),
        cursorColor: Flame.f500,
      ),
      extensions: [c],
    );
  }

  static ThemeData get light => _base(OttoColors.light);
  static ThemeData get dark => _base(OttoColors.dark);
}
