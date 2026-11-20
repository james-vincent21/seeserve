import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYoloResponse } from '../apps/api/src/infrastructure/inference/yolov8-http.provider.js';

describe('Inference Output Normalization', () => {
  it('normalizes Roboflow-style predictions', () => {
    const raw = {
      image: { width: 1000, height: 1000 },
      predictions: [
        {
          x: 500,
          y: 500,
          width: 200,
          height: 400,
          class: 'person',
          confidence: 0.88,
        },
      ],
    };

    const detections = normalizeYoloResponse(raw);
    assert.equal(detections.length, 1);
    assert.equal(detections[0].label, 'person');
    assert.equal(detections[0].confidence, 0.88);
    // x: 500 - 100 = 400 -> 0.4
    // x2: 500 + 100 = 600 -> 0.6
    assert.ok(Math.abs(detections[0].x1 - 0.4) < 0.01);
    assert.ok(Math.abs(detections[0].x2 - 0.6) < 0.01);
  });

  it('normalizes Ultralytics-style predictions with normalized coordinates', () => {
    const raw = {
      images: [
        {
          results: [
            {
              name: 'chair',
              confidence: 0.75,
              box: { x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 },
            },
          ],
        },
      ],
    };

    const detections = normalizeYoloResponse(raw);
    assert.equal(detections.length, 1);
    assert.equal(detections[0].label, 'chair');
    assert.equal(detections[0].confidence, 0.75);
    assert.equal(detections[0].x1, 0.1);
    assert.equal(detections[0].y1, 0.2);
    assert.equal(detections[0].x2, 0.3);
    assert.equal(detections[0].y2, 0.4);
  });

  it('normalizes pose keypoints when present', () => {
    const raw = {
      predictions: [
        {
          x1: 0.1,
          y1: 0.1,
          x2: 0.9,
          y2: 0.9,
          class: 'person',
          confidence: 0.95,
          keypoints: [
            { x: 0.5, y: 0.2, confidence: 0.8 },
            { x: 0.5, y: 0.5, confidence: 0.9 },
          ],
        },
      ],
    };

    const detections = normalizeYoloResponse(raw);
    assert.equal(detections.length, 1);
    assert.ok(detections[0].keypoints);
    assert.equal(detections[0].keypoints?.length, 2);
    assert.equal(detections[0].keypoints?.[0].y, 0.2);
  });
});
