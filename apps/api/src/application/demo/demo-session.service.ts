import { randomUUID } from 'node:crypto';
import type { DemoAlert, DemoSnapshot, DemoTableState, Zone } from '../../domain/demo/demo-session.js';
import { detectionFootPoint, detectionIsPerson, pointInPolygon } from '../../domain/demo/demo-session.js';
import { advanceTableState, markStaffVisit } from '../../domain/demo/table-rules.js';
import { hasRaisedHand, shouldAlertForHandRaise } from '../../domain/demo/hand-raise-rules.js';
import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';
import { env } from '../../config/env.js';
import { demoZones } from '../../config/demo-zones.js';

function emptyTable(zone: Zone): DemoTableState {
  return {
    id: zone.id, label: zone.label, status: 'vacant', seatedAt: null,
    pendingStatus: null, pendingSince: null, unattendedAlerted: false,
    staffVisitedAt: null, handRaiseSince: null, handRaiseCooldownUntil: 0,
  };
}

export class DemoSessionService {
  private tables = demoZones.map(emptyTable);
  private alerts: DemoAlert[] = [];
  private analyzedFrames = 0;

  constructor(private readonly provider: InferenceProvider) {}

  reset(): DemoSnapshot {
    this.tables = demoZones.map(emptyTable);
    this.alerts = [];
    this.analyzedFrames = 0;
    return this.snapshot();
  }

  async analyze(jpegBase64: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
    if (this.analyzedFrames >= env.DEMO_MAX_FRAMES) throw new Error('Demo frame limit reached. Reset the demo to continue.');
    const detections = await this.provider.detect(jpegBase64);
    this.analyzedFrames += 1;
    const detectionsByTable = new Map<string, typeof detections>();
    for (const detection of detections) {
      if (!detectionIsPerson(detection) || detection.confidence < 0.25) continue;
      const [x, y] = detectionFootPoint(detection);
      const zone = demoZones.find((item) => pointInPolygon(x, y, item.polygon));
      if (zone) detectionsByTable.set(zone.id, [...(detectionsByTable.get(zone.id) ?? []), detection]);
    }
    this.applyDetections(detectionsByTable, Math.max(0, videoTimeSeconds));
    return this.snapshot();
  }

  recordStaffVisit(tableId: string, videoTimeSeconds: number): void {
    const table = this.tables.find((item) => item.id === tableId);
    if (!table) throw new Error('Unknown table');
    const timestamp = Math.max(0, videoTimeSeconds);
    Object.assign(table, markStaffVisit(table, timestamp));
    table.unattendedAlerted = true;
  }

  snapshot(): DemoSnapshot {
    return {
      tables: this.tables.map((table) => ({ ...table })),
      alerts: this.alerts.slice(-10),
      analyzedFrames: this.analyzedFrames,
      maxFrames: env.DEMO_MAX_FRAMES,
      inferenceMode: env.INFERENCE_MODE,
    };
  }

  private applyDetections(detectionsByTable: Map<string, Detection[]>, now: number): void {
    const debounce = env.DEMO_DEBOUNCE_SECONDS;
    for (const table of this.tables) {
      const observedDetections = detectionsByTable.get(table.id) ?? [];
      const result = advanceTableState(table, observedDetections.length > 0, now, debounce, env.DEMO_UNATTENDED_SECONDS);
      Object.assign(table, result.state);
      if (result.alert) this.alerts.push({ ...result.alert, id: randomUUID() });

      const handRaised = observedDetections.some(hasRaisedHand);
      if (!handRaised) {
        table.handRaiseSince = null;
      } else if (table.handRaiseSince === null) {
        table.handRaiseSince = now;
      } else if (shouldAlertForHandRaise(now - table.handRaiseSince, now >= table.handRaiseCooldownUntil)) {
        this.alerts.push({
          id: randomUUID(), tableId: table.id, tableLabel: table.label, type: 'hand_raise',
          occurredAt: now, message: `${table.label} needs you`,
        });
        table.handRaiseCooldownUntil = now + 30;
        table.handRaiseSince = null;
      }
    }
  }
}
