import type { Detection } from '../vision/detection.js';

const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER = 6;
const LEFT_WRIST = 9;
const RIGHT_WRIST = 10;
const KEYPOINT_CONFIDENCE = 0.25;

export function hasRaisedHand(detection: Detection): boolean {
  const points = detection.keypoints;
  if (!points || points.length <= RIGHT_WRIST) return false;
  const pairs = [[LEFT_WRIST, LEFT_SHOULDER], [RIGHT_WRIST, RIGHT_SHOULDER]] as const;
  return pairs.some(([wristIndex, shoulderIndex]) => {
    const wrist = points[wristIndex];
    const shoulder = points[shoulderIndex];
    return wrist.confidence >= KEYPOINT_CONFIDENCE && shoulder.confidence >= KEYPOINT_CONFIDENCE && wrist.y < shoulder.y;
  });
}

export function shouldAlertForHandRaise(heldSeconds: number, cooldownReady: boolean): boolean {
  return heldSeconds >= 1.5 && cooldownReady;
}
