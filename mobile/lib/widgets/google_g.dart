import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The official four-color Google "G" (exact SVG paths from the design's
/// GoogleG, rendered via flutter_svg for crisp fidelity).
class GoogleG extends StatelessWidget {
  final double size;
  const GoogleG({super.key, this.size = 18});

  static const _svg = '''
<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.25h2.91c1.7-1.57 2.69-3.88 2.69-6.6z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.95 10.71A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.33z"/>
  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
</svg>
''';

  @override
  Widget build(BuildContext context) =>
      SvgPicture.string(_svg, width: size, height: size);
}
