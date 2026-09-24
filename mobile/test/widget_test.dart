import 'package:flutter_test/flutter_test.dart';
import 'package:ottonote/models/meeting.dart';
import 'package:ottonote/utils/format.dart';

void main() {
  group('Trust classification (mirrors ConfidenceBadge)', () {
    test('high confidence, unchecked → high with percent', () {
      final t = Trust.of(confidence: 0.95, verified: null);
      expect(t.kind, TrustKind.high);
      expect(t.pct, 95);
    });

    test('verified true → verified', () {
      final t = Trust.of(confidence: 0.6, verified: true);
      expect(t.kind, TrustKind.verified);
    });

    test('verified false → flagged', () {
      final t = Trust.of(confidence: 0.6, verified: false);
      expect(t.kind, TrustKind.flagged);
    });

    test('mid confidence, unchecked → review with percent', () {
      final t = Trust.of(confidence: 0.6, verified: null);
      expect(t.kind, TrustKind.review);
      expect(t.pct, 60);
    });

    test('low confidence, unchecked → flagged', () {
      final t = Trust.of(confidence: 0.3, verified: null);
      expect(t.kind, TrustKind.flagged);
    });
  });

  group('ProgressStep percent (mirrors format.ts)', () {
    test('transcribing → 30', () {
      expect(ProgressStep.transcribing.percent, 30);
    });
    test('null (queued) → 5', () {
      const ProgressStep? none = null;
      expect(none.percent, 5);
    });
    test('finalizing → 98', () {
      expect(ProgressStep.finalizing.percent, 98);
    });
  });

  group('Formatting', () {
    test('duration minutes', () => expect(Fmt.duration(2820), '47m'));
    test('duration hours', () => expect(Fmt.duration(3900), '1h 05m'));
    test('duration null', () => expect(Fmt.duration(null), '—'));
    test('clock mm:ss', () => expect(Fmt.clock(252), '04:12'));
    test('clock h:mm:ss', () => expect(Fmt.clock(3661), '1:01:01'));
  });

  group('MeetingStatus', () {
    test('done is terminal', () => expect(MeetingStatus.done.isTerminal, true));
    test('processing is active',
        () => expect(MeetingStatus.processing.isActive, true));
    test('unknown wire value → pending',
        () => expect(MeetingStatus.fromWire('weird'), MeetingStatus.pending));
  });
}
