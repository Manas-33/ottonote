import 'dart:async';

import 'package:cross_file/cross_file.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../providers/workspace_providers.dart';
import '../services/capture_controller.dart';
import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../utils/format.dart';
import '../widgets/app_icons.dart';
import '../widgets/section_rule.dart';
import '../widgets/wave_meter.dart';
import 'processing_screen.dart';

/// 03 · Recording. Calm centered timer + live meter; Stop is the primary,
/// thumb-reachable action. Mirrors Recording.tsx (audio stays local until stop).
class RecordingScreen extends ConsumerStatefulWidget {
  /// autoStart=false renders the UI without opening the mic (used by the
  /// dev preview harness, where microphone capture isn't available).
  final bool autoStart;
  const RecordingScreen({super.key, this.autoStart = true});

  @override
  ConsumerState<RecordingScreen> createState() => _RecordingScreenState();
}

class _RecordingScreenState extends ConsumerState<RecordingScreen> {
  final _rec = AudioRecorder();
  final _title = TextEditingController();
  Timer? _timer;
  StreamSubscription<Amplitude>? _ampSub;
  DateTime _startedAt = DateTime.now();
  int _elapsed = 0;
  double _level = 0;
  bool _paused = false;
  bool _stopping = false;
  String? _error;

  static final bool _web = kIsWeb;
  AudioEncoder get _encoder => _web ? AudioEncoder.opus : AudioEncoder.aacLc;
  String get _ext => _web ? 'webm' : 'm4a';
  String get _contentType => _web ? 'audio/webm' : 'audio/mp4';

  @override
  void initState() {
    super.initState();
    if (widget.autoStart) {
      _start();
    } else {
      _elapsed = 1694; // demo elapsed for static preview
      _level = 0.5;
    }
  }

  Future<void> _start() async {
    try {
      if (!await _rec.hasPermission()) {
        setState(() => _error = 'Microphone permission denied.');
        return;
      }
      String path = 'ottonote_${DateTime.now().millisecondsSinceEpoch}.$_ext';
      if (!_web) {
        final dir = await getTemporaryDirectory();
        path = '${dir.path}/$path';
      }
      await _rec.start(RecordConfig(encoder: _encoder), path: path);
      _startedAt = DateTime.now();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!_paused && mounted) setState(() => _elapsed++);
      });
      _ampSub = _rec
          .onAmplitudeChanged(const Duration(milliseconds: 200))
          .listen((amp) {
        if (!mounted) return;
        final norm = ((amp.current + 45) / 45).clamp(0.0, 1.0);
        setState(() => _level = norm);
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not start recording: $e');
    }
  }

  Future<void> _togglePause() async {
    if (_paused) {
      await _rec.resume();
    } else {
      await _rec.pause();
    }
    setState(() => _paused = !_paused);
  }

  Future<void> _stopAndSave() async {
    if (_stopping) return;
    setState(() => _stopping = true);
    _timer?.cancel();
    await _ampSub?.cancel();
    try {
      final path = await _rec.stop();
      if (path == null) {
        setState(() {
          _error = 'Recording produced no audio.';
          _stopping = false;
        });
        return;
      }
      final bytes = await XFile(path).readAsBytes();
      final title = _title.text.trim();
      final workspaceId = ref.read(selectedWorkspaceProvider);
      // Fire the upload+process pipeline; Processing screen watches it.
      unawaited(ref.read(captureControllerProvider.notifier).run(
            bytes: bytes,
            filename: 'ottonote_${DateTime.now().millisecondsSinceEpoch}.$_ext',
            title: title.isEmpty ? null : title,
            workspaceId: workspaceId,
            contentType: _contentType,
          ));
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ProcessingScreen()),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not save recording: $e';
          _stopping = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ampSub?.cancel();
    _rec.dispose();
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = OttoColors.of(context);
    if (_error != null) return _errorView(c);

    final t = Fmt.elapsedParts(_elapsed);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            _topBar(c),
            Expanded(child: _center(c, t)),
            _controls(c),
          ],
        ),
      ),
    );
  }

  Widget _topBar(OttoColors c) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
      child: Row(
        children: [
          _RecordingPill(paused: _paused),
          const Spacer(),
          IconButton(
            onPressed: () {},
            icon: Icon(AppIcons.mic, size: 18, color: c.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _center(OttoColors c, ({String hh, String mm, String ss}) t) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          children: [
            const SizedBox(height: 8),
            Text(
              _paused ? '❚❚ PAUSED' : '● LIVE · CAPTURING ROOM AUDIO',
              style: AppType.mono(
                  size: 10.5, letterSpacing: 1.9, color: c.textMuted),
            ),
            const SizedBox(height: 20),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text.rich(
              TextSpan(children: [
                TextSpan(
                    text: '${t.hh}:',
                    style: AppType.mono(
                        size: 54,
                        weight: FontWeight.w500,
                        letterSpacing: -1.6,
                        color: c.textFaint)),
                TextSpan(
                    text: t.mm,
                    style: AppType.mono(
                        size: 76,
                        weight: FontWeight.w500,
                        letterSpacing: -2.3,
                        color: c.textPrimary)),
                TextSpan(
                    text: ':',
                    style: AppType.mono(
                        size: 76,
                        weight: FontWeight.w500,
                        color: c.textFaint)),
                TextSpan(
                    text: t.ss,
                    style: AppType.mono(
                        size: 76,
                        weight: FontWeight.w500,
                        letterSpacing: -2.3,
                        color: c.textPrimary)),
              ]),
              maxLines: 1,
              softWrap: false,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'STARTED ${Fmt.clock24(_startedAt)} · SAVING LOCALLY',
              style: AppType.mono(
                  size: 10.5, letterSpacing: 1.26, color: c.textMuted),
            ),
            const SizedBox(height: 40),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: WaveMeter(bars: 44, live: !_paused, level: _level),
            ),
            const SizedBox(height: 36),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionRule(index: '•', label: 'Meeting title'),
                  _titleField(c),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _titleField(OttoColors c) {
    return TextField(
      controller: _title,
      style: TextStyle(fontSize: 15, color: c.textPrimary),
      cursorColor: Flame.f500,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(
        hintText: 'Untitled meeting',
        hintStyle: TextStyle(color: c.textMuted, fontSize: 15),
        prefixIcon: Icon(AppIcons.pencilLine, size: 15, color: c.textMuted),
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

  Widget _controls(OttoColors c) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      decoration: BoxDecoration(
        color: c.isDark
            ? Paper.p900.withValues(alpha: 0.3)
            : Paper.p100.withValues(alpha: 0.5),
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                _pauseButton(c),
                const SizedBox(width: 12),
                Expanded(child: _stopButton()),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(AppIcons.shield, size: 11, color: c.textFaint),
                const SizedBox(width: 6),
                Text('AUDIO STAYS ON DEVICE UNTIL YOU STOP',
                    style: AppType.mono(
                        size: 10, letterSpacing: 1.2, color: c.textFaint)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _pauseButton(OttoColors c) {
    return InkWell(
      onTap: _stopping ? null : _togglePause,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 60,
        height: 60,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(_paused ? AppIcons.play : AppIcons.pause,
                size: 20, color: c.textPrimary),
            const SizedBox(height: 2),
            Text(_paused ? 'RESUME' : 'PAUSE',
                style: AppType.mono(
                    size: 8.5, letterSpacing: 0.85, color: c.textMuted)),
          ],
        ),
      ),
    );
  }

  Widget _stopButton() {
    return InkWell(
      onTap: _stopping ? null : _stopAndSave,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 60,
        decoration: BoxDecoration(
          color: Accent.red600,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: _stopping
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                      strokeWidth: 2.5, color: Colors.white))
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text('Stop & save',
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.white)),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _errorView(OttoColors c) {
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(AppIcons.mic, size: 34, color: c.textMuted),
              const SizedBox(height: 16),
              Text('Recording unavailable',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: c.textPrimary)),
              const SizedBox(height: 8),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13.5, color: c.textSecondary)),
              const SizedBox(height: 20),
              TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                child: const Text('Go back'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecordingPill extends StatefulWidget {
  final bool paused;
  const _RecordingPill({required this.paused});

  @override
  State<_RecordingPill> createState() => _RecordingPillState();
}

class _RecordingPillState extends State<_RecordingPill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
        ..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = OttoColors.of(context).isDark;
    final t = widget.paused ? amberTint(dark) : redTint(dark);
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: widget.paused
                ? const AlwaysStoppedAnimation(1.0)
                : Tween(begin: 1.0, end: 0.3).animate(_ctrl),
            child: Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: t.fg, shape: BoxShape.circle),
            ),
          ),
          const SizedBox(width: 6),
          Text(widget.paused ? 'PAUSED' : 'RECORDING',
              style: AppType.mono(
                  size: 10, letterSpacing: 1.2, color: t.fg, weight: FontWeight.w500)),
        ],
      ),
    );
  }
}
