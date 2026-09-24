import 'package:flutter/material.dart';

import '../theme/palette.dart';

/// Workspace (GET /workspaces). `color` is one of the backend's ALLOWED_COLORS.
class Workspace {
  final String id;
  final String name;
  final String color; // slate | blue | emerald | amber | rose | violet
  final bool isDefault;
  final DateTime createdAt;

  const Workspace({
    required this.id,
    required this.name,
    required this.color,
    required this.isDefault,
    required this.createdAt,
  });

  factory Workspace.fromJson(Map<String, dynamic> j) => Workspace(
        id: '${j['id']}',
        name: (j['name'] as String?) ?? 'Workspace',
        color: (j['color'] as String?) ?? 'slate',
        isDefault: (j['is_default'] as bool?) ?? false,
        createdAt:
            DateTime.tryParse('${j['created_at']}')?.toLocal() ?? DateTime.now(),
      );

  Color get dotColor => workspaceDotColor(color);
}

/// The six allowed workspace colors → swatch, matching the extension palette.
Color workspaceDotColor(String color) {
  switch (color) {
    case 'blue':
      return const Color(0xFF3B82F6);
    case 'emerald':
      return Accent.emerald500;
    case 'amber':
      return Accent.amber500;
    case 'rose':
      return Accent.rose500;
    case 'violet':
      return Accent.violet500;
    case 'slate':
    default:
      return const Color(0xFF64748B);
  }
}

const kWorkspaceColors = <String>[
  'slate',
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
];
