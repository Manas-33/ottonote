import 'package:flutter/material.dart';

/// Raw color scales, transcribed exactly from the design tokens in
/// "OttoNote Mobile App.html" (tailwind.config → theme.extend.colors).
///
/// `paper` is the warm neutral, `flame` the orange accent. Named-shade
/// accents (emerald/amber/red/sky/violet/rose) use Tailwind defaults, which
/// the mockups reference directly.
class Paper {
  const Paper._();
  static const p50 = Color(0xFFFAFAF7);
  static const p100 = Color(0xFFF4F3EE);
  static const p150 = Color(0xFFECEBE4);
  static const p200 = Color(0xFFE3E2D9);
  static const p300 = Color(0xFFC8C6B9);
  static const p400 = Color(0xFF9C9A8D);
  static const p500 = Color(0xFF6E6D62);
  static const p600 = Color(0xFF4A4943);
  static const p700 = Color(0xFF33332E);
  static const p800 = Color(0xFF22221F);
  static const p900 = Color(0xFF141413);
  static const p950 = Color(0xFF0B0B0A);
}

class Flame {
  const Flame._();
  static const f50 = Color(0xFFFFF4ED);
  static const f100 = Color(0xFFFFE5D4);
  static const f200 = Color(0xFFFFC6A8);
  static const f300 = Color(0xFFFF9D70);
  static const f400 = Color(0xFFFF7136);
  static const f500 = Color(0xFFFF5310);
  static const f600 = Color(0xFFF03C00);
  static const f700 = Color(0xFFC72D02);
  static const f800 = Color(0xFF9E260B);
  static const f900 = Color(0xFF80230D);
}

/// Tailwind default shades used by badges, chips and the speaker palette.
class Accent {
  const Accent._();
  // emerald
  static const emerald100 = Color(0xFFD1FAE5);
  static const emerald300 = Color(0xFF6EE7B7);
  static const emerald500 = Color(0xFF10B981);
  static const emerald800 = Color(0xFF065F46);
  static const emerald900 = Color(0xFF064E3B);
  // amber
  static const amber100 = Color(0xFFFEF3C7);
  static const amber300 = Color(0xFFFCD34D);
  static const amber500 = Color(0xFFF59E0B);
  static const amber800 = Color(0xFF92400E);
  static const amber900 = Color(0xFF78350F);
  // red
  static const red100 = Color(0xFFFEE2E2);
  static const red300 = Color(0xFFFCA5A5);
  static const red500 = Color(0xFFEF4444);
  static const red600 = Color(0xFFDC2626);
  static const red700 = Color(0xFFB91C1C);
  static const red800 = Color(0xFF991B1B);
  static const red900 = Color(0xFF7F1D1D);
  // sky
  static const sky300 = Color(0xFF7DD3FC);
  static const sky500 = Color(0xFF0EA5E9);
  static const sky700 = Color(0xFF0369A1);
  // violet
  static const violet500 = Color(0xFF8B5CF6);
  // rose
  static const rose500 = Color(0xFFF43F5E);
}
