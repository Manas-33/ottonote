// Dev-only visual harness: renders every screen with mock data and provider
// overrides, so the UI can be reviewed without a live backend or sign-in.
//
//   flutter run -t lib/dev_preview.dart -d chrome
//
// Not part of the shipping app (main.dart is the real entrypoint).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'models/meeting.dart';
import 'models/workspace.dart';
import 'providers/core_providers.dart';
import 'providers/meetings_providers.dart';
import 'providers/workspace_providers.dart';
import 'screens/library_screen.dart';
import 'screens/meeting_detail_screen.dart';
import 'screens/processing_screen.dart';
import 'screens/recording_screen.dart';
import 'screens/sign_in_screen.dart';
import 'screens/sheets/share_sheet.dart';
import 'screens/sheets/workspace_sheet.dart';
import 'services/capture_controller.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Supabase.initialize(
        url: 'https://preview.supabase.co', anonKey: 'preview-anon-key');
  } catch (_) {}
  runApp(
    ProviderScope(
      overrides: [
        supabaseReadyProvider.overrideWithValue(true),
        workspacesProvider.overrideWith((ref) async => _mockWorkspaces),
        meetingsListProvider.overrideWith(_MockList.new),
        meetingDetailProvider.overrideWith(_MockDetail.new),
        captureControllerProvider.overrideWith(_MockCapture.new),
      ],
      child: const _PreviewApp(),
    ),
  );
}

class _PreviewApp extends StatelessWidget {
  const _PreviewApp();
  @override
  Widget build(BuildContext context) {
    // Screen selectable by URL (?screen=library) so it can be screenshotted
    // without tapping through the menu.
    final screen = Uri.base.queryParameters['screen'];
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: _screenFor(screen),
    );
  }
}

Widget _screenFor(String? s) {
  switch (s) {
    case 'signin':
      return const SignInScreen();
    case 'library':
      return const LibraryScreen();
    case 'recording':
      return const RecordingScreen(autoStart: false);
    case 'processing':
      return const ProcessingScreen();
    case 'detail':
      return const MeetingDetailScreen(meetingId: 'm1');
    case 'workspace_sheet':
      return const _SheetLauncher(share: false);
    case 'share_sheet':
      return const _SheetLauncher(share: true);
    default:
      return const _Menu();
  }
}

/// Shows Library then opens a sheet over it (for sheet screenshots).
class _SheetLauncher extends StatefulWidget {
  final bool share;
  const _SheetLauncher({required this.share});
  @override
  State<_SheetLauncher> createState() => _SheetLauncherState();
}

class _SheetLauncherState extends State<_SheetLauncher> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (widget.share) {
        showShareSheet(context, meetingTitle: 'Q3 roadmap planning');
      } else {
        showWorkspaceSheet(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) => const LibraryScreen();
}

class _Menu extends StatelessWidget {
  const _Menu();

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    Widget btn(String label, Widget Function() screen) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => screen())),
              child: Text(label),
            ),
          ),
        );
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: ListView(
            children: [
              Text('OttoNote — preview',
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: c.textPrimary)),
              const SizedBox(height: 16),
              btn('01 · Sign in', () => const SignInScreen()),
              btn('02 · Library', () => const LibraryScreen()),
              btn('03 · Recording', () => const RecordingScreen()),
              btn('04 · Processing', () => const ProcessingScreen()),
              btn('05 · Meeting detail (done)',
                  () => const MeetingDetailScreen(meetingId: 'm1')),
              Builder(builder: (ctx) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => showWorkspaceSheet(ctx),
                      child: const Text('Sheet · Workspace picker'),
                    ),
                  ),
                );
              }),
              Builder(builder: (ctx) {
                return SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () =>
                        showShareSheet(ctx, meetingTitle: 'Q3 roadmap planning'),
                    child: const Text('Sheet · Share'),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------- mock data ----------------

final _mockWorkspaces = [
  Workspace(
      id: 'ws-product',
      name: 'Product',
      color: 'blue',
      isDefault: true,
      createdAt: DateTime.now()),
  Workspace(
      id: 'ws-design',
      name: 'Design',
      color: 'violet',
      isDefault: false,
      createdAt: DateTime.now()),
  Workspace(
      id: 'ws-sales',
      name: 'Sales',
      color: 'emerald',
      isDefault: false,
      createdAt: DateTime.now()),
];

List<MeetingSummary> _mockSummaries() {
  final now = DateTime.now();
  Map<String, dynamic> row(String id, String title, String status, String? step,
          double dur, int spk, String? ws, DateTime created) =>
      {
        'id': id,
        'title': title,
        'status': status,
        'progress_step': step,
        'duration_sec': dur,
        'num_speakers': spk,
        'workspace_id': ws,
        'created_at': created.toUtc().toIso8601String(),
      };
  return [
    MeetingSummary.fromJson(row('m1', 'Q3 roadmap planning', 'done', null, 2820,
        3, 'ws-product', now.subtract(const Duration(hours: 2)))),
    MeetingSummary.fromJson(row('m2', 'Design review — onboarding', 'done', null,
        1920, 4, 'ws-design', now.subtract(const Duration(days: 1)))),
    MeetingSummary.fromJson(row('m3', 'Vendor demo — Mixpanel', 'processing',
        'summarizing', 3240, 5, 'ws-product', now.subtract(const Duration(days: 1)))),
    MeetingSummary.fromJson(row('m4', '1:1 with Alex', 'done', null, 1680, 2,
        null, now.subtract(const Duration(days: 3)))),
    MeetingSummary.fromJson(row('m5', 'Customer call — Northwind', 'failed', null,
        2460, 3, 'ws-sales', now.subtract(const Duration(days: 5)))),
  ];
}

Meeting _mockMeeting({required bool processing}) {
  final now = DateTime.now().subtract(const Duration(hours: 2));
  return Meeting.fromJson({
    'id': processing ? 'm3' : 'm1',
    'title': processing ? 'Vendor demo — Mixpanel' : 'Q3 roadmap planning',
    'status': processing ? 'processing' : 'done',
    'progress_step': processing ? 'summarizing' : null,
    'task_id': 't1',
    'error_message': null,
    'duration_sec': processing ? 3240 : 2820,
    'language': 'en',
    'num_speakers': 3,
    'workspace_id': 'ws-product',
    'created_at': now.toUtc().toIso8601String(),
    'speaker_names': {'SPEAKER_00': 'Sarah Reed', 'SPEAKER_01': 'Marcus Lin'},
    'segments': [
      {'idx': 0, 'start_sec': 0, 'end_sec': 9, 'speaker': 'SPEAKER_00', 'text': "Alright, let's get into Q3 planning — three things: onboarding, hiring, analytics."},
      {'idx': 1, 'start_sec': 9, 'end_sec': 13, 'speaker': 'SPEAKER_01', 'text': 'How long until we can ship a self-serve prototype?'},
      {'idx': 2, 'start_sec': 13, 'end_sec': 21, 'speaker': 'SPEAKER_00', 'text': 'The flow is mostly designed. I can have a working build by end of next week.'},
      {'idx': 3, 'start_sec': 21, 'end_sec': 30, 'speaker': 'SPEAKER_02', 'text': 'On hiring — I want two senior reqs open before we scope more.'},
      {'idx': 4, 'start_sec': 30, 'end_sec': 41, 'speaker': 'SPEAKER_01', 'text': 'And we should consolidate analytics onto a single vendor this quarter.'},
    ],
    'summary': processing
        ? null
        : {
            'tldr': 'Three Q3 priorities locked: <mark>onboarding</mark>, <mark>hiring</mark>, and <mark>analytics consolidation</mark>.',
            'summary': 'The team aligned on three Q3 priorities: shipping the self-serve onboarding flow, hiring two senior engineers, and consolidating the analytics stack onto a single vendor. Sarah owns onboarding, Alex takes hiring, and a vendor decision is due by end of next week.',
            'decisions': [
              {'text': 'Self-serve onboarding is the Q3 #1 priority', 'source_segment_indices': [2], 'confidence': 0.62, 'verified': true},
              {'text': 'Consolidate analytics to a single vendor by end of next week', 'source_segment_indices': [4], 'confidence': 0.95, 'verified': null},
              {'text': 'Defer the mobile app redesign to Q4', 'source_segment_indices': [3], 'confidence': 0.66, 'verified': null},
            ],
            'keywords': {
              'themes': ['Q3', 'onboarding flow', 'analytics stack', 'hiring'],
              'terms': ['vendor', 'end of next week', 'OKRs'],
            },
            'follow_ups': [
              'Confirm analytics vendor shortlist',
              'Circulate onboarding spec for review',
              'Set date for Q4 planning',
            ],
          },
    'action_items': processing
        ? []
        : [
            {'id': 'a1', 'assignee': 'Sarah', 'task': 'Draft self-serve onboarding spec', 'due_date': 'Fri', 'status': 'open', 'speaker_label': 'SPEAKER_00', 'source_segment_indices': [2], 'confidence': 0.6, 'verified': true},
            {'id': 'a2', 'assignee': 'Alex', 'task': 'Open 2 senior engineer reqs', 'due_date': 'Mon', 'status': 'done', 'speaker_label': 'SPEAKER_02', 'source_segment_indices': [3], 'confidence': 0.92, 'verified': null},
            {'id': 'a3', 'assignee': '', 'task': 'Share Q3 OKR draft with leadership', 'due_date': null, 'status': 'open', 'speaker_label': null, 'source_segment_indices': [4], 'confidence': 0.45, 'verified': false},
          ],
    'calendar_events': [],
  });
}

// ---------------- mock notifiers ----------------

class _MockList extends MeetingsListNotifier {
  @override
  Future<List<MeetingSummary>> build() async => _mockSummaries();
}

class _MockDetail extends MeetingDetailNotifier {
  @override
  Future<Meeting> build(String id) async => _mockMeeting(processing: id == 'm3');
}

class _MockCapture extends CaptureController {
  @override
  CaptureState build() => const CaptureProcessing('m3');
}
