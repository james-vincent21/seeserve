import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DemoSession } from '../apps/api/src/application/demo/demo-session.js';
import { env } from '../apps/api/src/config/env.js';
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

describe('Standard vs Iftar Modes', () => {
  it('toggles mode between standard and iftar', () => {
    const provider = new TestInferenceProvider();
    const session = new DemoSession(provider);

    assert.equal(session.snapshot().mode, 'standard');
    session.setMode('iftar');
    assert.equal(session.snapshot().mode, 'iftar');
    session.setMode('standard');
    assert.equal(session.snapshot().mode, 'standard');
  });

  it('suppresses early unattended alerts when in iftar mode', async () => {
    const provider = new TestInferenceProvider();
    const session = new DemoSession(provider);

    // Person at Table 1 (zone is x: 0.03-0.41, y: 0.47-0.96)
    provider.setDetections([
      { label: 'person', confidence: 0.9, x1: 0.1, y1: 0.5, x2: 0.3, y2: 0.8 },
    ]);

    // Set to Iftar mode before seating
    session.setMode('iftar');

    // Frames at t=0 and t=1 seat the table
    await session.analyzeFrame('dummy', 0);
    await session.analyzeFrame('dummy', 1);
    assert.equal(session.snapshot().tables[0].status, 'seated');

    const seatedAt = session.snapshot().tables[0].seatedAt ?? 0;
    // Time past standard threshold but within Iftar threshold (10x)
    const earlyTime = seatedAt + env.DEMO_UNATTENDED_SECONDS + 2;
    await session.analyzeFrame('dummy', earlyTime);

    // Alerts should be empty because Iftar mode suppresses early unattended alerts
    const iftarAlerts = session.snapshot().alerts.filter((a) => a.type === 'unattended');
    assert.equal(iftarAlerts.length, 0);

    // Switch back to standard mode and evaluate at earlyTime + 1 -> now triggers
    session.setMode('standard');
    await session.analyzeFrame('dummy', earlyTime + 1);

    const standardAlerts = session.snapshot().alerts.filter((a) => a.type === 'unattended');
    assert.equal(standardAlerts.length, 1);
    assert.equal(standardAlerts[0].tableId, 'table-1');
  });
});
