import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DemoSession, type DemoSessionConfig } from '../apps/api/src/application/demo/demo-session.js';
import type { Detection, InferenceProvider } from '../apps/api/src/domain/vision/detection.js';

class TestInferenceProvider implements InferenceProvider {
  constructor(private detections: Detection[] = []) {}
  setDetections(detections: Detection[]) {
    this.detections = detections;
  }
  async detect(): Promise<Detection[]> {
    return this.detections;
  }
}

// Pinned so the tests do not depend on the developer's .env file.
const config: DemoSessionConfig = {
  maxFrames: 100,
  unattendedSeconds: 2,
  debounceSeconds: 1,
  initialMode: 'standard',
  inferenceMode: 'mock',
};

// Person at Table 1 (zone is x: 0.03-0.41, y: 0.47-0.96)
const guestAtTable1: Detection = { label: 'person', confidence: 0.9, x1: 0.1, y1: 0.5, x2: 0.3, y2: 0.8 };

describe('Standard vs Iftar Modes', () => {
  it('toggles mode between standard and iftar', () => {
    const session = new DemoSession(new TestInferenceProvider(), undefined, config);

    assert.equal(session.snapshot().mode, 'standard');
    session.setMode('iftar');
    assert.equal(session.snapshot().mode, 'iftar');
    assert.equal(session.snapshot().unattendedSeconds, 20);
    session.setMode('standard');
    assert.equal(session.snapshot().mode, 'standard');
    assert.equal(session.snapshot().unattendedSeconds, 2);
  });

  it('suppresses early unattended alerts when in iftar mode', async () => {
    const provider = new TestInferenceProvider([guestAtTable1]);
    const session = new DemoSession(provider, undefined, config);
    session.setMode('iftar');

    // Frames at t=0 and t=1 seat the table (debounce is 1 s).
    await session.analyzeFrame('dummy', 0);
    await session.analyzeFrame('dummy', 1);
    assert.equal(session.snapshot().tables[0].status, 'seated');

    const seatedAt = session.snapshot().tables[0].seatedAt ?? 0;
    // Past the standard threshold but within the Iftar threshold (10x).
    const earlyTime = seatedAt + config.unattendedSeconds + 2;
    await session.analyzeFrame('dummy', earlyTime);
    assert.equal(session.snapshot().alerts.filter((a) => a.type === 'unattended').length, 0);

    // Switching back to standard mode makes the same wait alert.
    session.setMode('standard');
    await session.analyzeFrame('dummy', earlyTime + 1);
    const standardAlerts = session.snapshot().alerts.filter((a) => a.type === 'unattended');
    assert.equal(standardAlerts.length, 1);
    assert.equal(standardAlerts[0].tableId, 'table-1');
  });
});

describe('Staff visits', () => {
  it('resolves the active alert for that table and does not re-alert the same seating', async () => {
    const provider = new TestInferenceProvider([guestAtTable1]);
    const session = new DemoSession(provider, undefined, { ...config, debounceSeconds: 0 });

    await session.analyzeFrame('dummy', 0);
    await session.analyzeFrame('dummy', 3);
    assert.equal(session.snapshot().alerts.length, 1);

    session.markStaffVisited('table-1', 4);
    assert.equal(session.snapshot().alerts.length, 0);
    assert.equal(session.snapshot().resolvedAlertCount, 1);

    await session.analyzeFrame('dummy', 10);
    assert.equal(session.snapshot().alerts.length, 0);
  });

  it('records the current mode with each persisted event', async () => {
    const recorded: string[] = [];
    const recorder = {
      record: async (_alert: unknown, mode: string) => { recorded.push(`alert:${mode}`); },
      recordStaffVisit: async (_t: string, _s: number, mode: string) => { recorded.push(`visit:${mode}`); },
    };
    const session = new DemoSession(new TestInferenceProvider([guestAtTable1]), recorder, { ...config, debounceSeconds: 0 });
    session.setMode('iftar');
    await session.analyzeFrame('dummy', 0);
    await session.analyzeFrame('dummy', 25);
    session.markStaffVisited('table-1', 26);
    assert.deepEqual(recorded, ['alert:iftar', 'visit:iftar']);
  });
});
