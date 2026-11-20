import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasRaisedHand, shouldAlertForHandRaise } from '../apps/api/src/domain/demo/hand-raise-rules.js';
import type { Detection } from '../apps/api/src/domain/vision/detection.js';

describe('Hand Raise Rules', () => {
  it('detects a raised left hand when wrist is above shoulder with high confidence', () => {
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0.5, y: 0.5, confidence: 0.9 }));
    // Left shoulder (idx 5), Left wrist (idx 9)
    keypoints[5] = { x: 0.5, y: 0.5, confidence: 0.85 };
    keypoints[9] = { x: 0.5, y: 0.2, confidence: 0.85 }; // y=0.2 is higher than y=0.5 in image coords

    const detection: Detection = {
      label: 'person',
      confidence: 0.9,
      x1: 0.4,
      y1: 0.2,
      x2: 0.6,
      y2: 0.8,
      keypoints,
    };

    assert.equal(hasRaisedHand(detection), true);
  });

  it('rejects hand raise when wrist is below shoulder', () => {
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0.5, y: 0.5, confidence: 0.9 }));
    keypoints[5] = { x: 0.5, y: 0.3, confidence: 0.85 };
    keypoints[9] = { x: 0.5, y: 0.6, confidence: 0.85 }; // wrist below shoulder

    const detection: Detection = {
      label: 'person',
      confidence: 0.9,
      x1: 0.4,
      y1: 0.2,
      x2: 0.6,
      y2: 0.8,
      keypoints,
    };

    assert.equal(hasRaisedHand(detection), false);
  });

  it('rejects hand raise when confidence is below threshold', () => {
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0.5, y: 0.5, confidence: 0.1 }));
    keypoints[5] = { x: 0.5, y: 0.5, confidence: 0.1 };
    keypoints[9] = { x: 0.5, y: 0.2, confidence: 0.1 };

    const detection: Detection = {
      label: 'person',
      confidence: 0.9,
      x1: 0.4,
      y1: 0.2,
      x2: 0.6,
      y2: 0.8,
      keypoints,
    };

    assert.equal(hasRaisedHand(detection), false);
  });

  it('evaluates hold duration and cooldown for hand raise alerts', () => {
    // Hold less than 1.5s should not alert
    assert.equal(shouldAlertForHandRaise(1.0, true), false);
    // Hold >= 1.5s with cooldown ready should alert
    assert.equal(shouldAlertForHandRaise(1.5, true), true);
    assert.equal(shouldAlertForHandRaise(2.0, true), true);
    // Hold >= 1.5s with cooldown active should not alert
    assert.equal(shouldAlertForHandRaise(2.0, false), false);
  });
});
