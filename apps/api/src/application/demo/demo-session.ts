import { randomUUID } from 'node:crypto';
import type { DemoAlert, DemoMode, DemoSnapshot, DemoTable, FocusedDetection } from '../../domain/demo/demo-types.js';
import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';
import { hasRaisedHand, shouldAlertForHandRaise } from '../../domain/demo/hand-raise-rules.js';
import { advanceTableState, effectiveUnattendedSeconds, markStaffVisit } from '../../domain/demo/table-rules.js';
import { env } from '../../config/env.js';
import { demoZones } from '../../config/demo-zones.js';

/** Port for persisting demo events. Implemented by the PostgreSQL adapter; optional. */
export interface DemoEventRecorder {
  record(alert: DemoAlert, mode: DemoMode): Promise<void>;
  recordStaffVisit(tableId: string, videoTimeSeconds: number, mode: DemoMode): Promise<void>;
}

export interface DemoSessionConfig {
  maxFrames: number;
  unattendedSeconds: number;
  debounceSeconds: number;
  initialMode: DemoMode;
  inferenceMode: DemoSnapshot['inferenceMode'];
}

export function demoConfigFromEnv(): DemoSessionConfig {
  return {
    maxFrames: env.DEMO_MAX_FRAMES,
    unattendedSeconds: env.DEMO_UNATTENDED_SECONDS,
    debounceSeconds: env.DEMO_DEBOUNCE_SECONDS,
    initialMode: env.DEMO_MODE,
    inferenceMode: env.INFERENCE_MODE,
  };
}

const HAND_RAISE_COOLDOWN_SECONDS = 30;
const PERSON_MIN_OVERLAP = 0.2;
const CHAIR_MIN_OVERLAP = 0.05;
const MIN_CONFIDENCE = 0.25;

function newTables(): DemoTable[] {
  return demoZones.map((zone) => ({
    id: zone.id,
    label: zone.label,
    status: 'vacant',
    seatedAt: null,
    pendingStatus: null,
    pendingSince: null,
    unattendedAlerted: false,
    staffVisitedAt: null,
    handRaiseSince: null,
    handRaiseCooldownUntil: 0,
    seats: [],
    zone: zone.polygon.map((point) => [...point] as [number, number]),
  }));
}

/** Demo runtime state is in memory. Frame bytes are not retained. */
export class DemoSession {
  private tables = newTables();
  private alerts: DemoAlert[] = [];
  private analyzedFrames = 0;
  private mode: DemoMode;
  private lastDetections: FocusedDetection[] = [];

  constructor(
    private readonly provider: InferenceProvider,
    private readonly eventRecorder?: DemoEventRecorder,
    private readonly config: DemoSessionConfig = demoConfigFromEnv(),
  ) {
    this.mode = config.initialMode;
  }

  snapshot(): DemoSnapshot {
    const active = this.alerts.filter((alert) => alert.resolvedAt === null);
    return {
      tables: this.tables.map((table) => ({
        ...table,
        seats: table.seats.map((seat) => ({ ...seat })),
        zone: table.zone.map((point) => [...point] as [number, number]),
      })),
      alerts: active.slice(-10).map((alert) => ({ ...alert })),
      resolvedAlertCount: this.alerts.length - active.length,
      analyzedFrames: this.analyzedFrames,
      maxFrames: this.config.maxFrames,
      mode: this.mode,
      unattendedSeconds: effectiveUnattendedSeconds(this.config.unattendedSeconds, this.mode),
      debounceSeconds: this.config.debounceSeconds,
      inferenceMode: this.config.inferenceMode,
      detections: this.lastDetections.map((item) => ({ ...item })),
    };
  }

  reset(): DemoSnapshot {
    this.tables = newTables();
    this.alerts = [];
    this.analyzedFrames = 0;
    this.lastDetections = [];
    return this.snapshot();
  }

  setMode(mode: DemoMode): DemoSnapshot {
    this.mode = mode;
    return this.snapshot();
  }

  async analyzeFrame(jpegBase64: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
    if (this.analyzedFrames >= this.config.maxFrames) throw new Error('Frame limit reached. Reset the demo to continue.');
    const detections = await this.provider.detect(jpegBase64);
    this.analyzedFrames += 1;
    const now = Math.max(0, videoTimeSeconds);
    const people = focus(detections.filter((d) => isPerson(d) && d.confidence >= MIN_CONFIDENCE));
    const chairs = focus(detections.filter((d) => isChair(d) && d.confidence >= MIN_CONFIDENCE));

    // Full person boxes often include the chair and floor, so their bottom edge can fall outside
    // the table zone even when the guest is seated. Assign by greatest box overlap instead, and
    // ignore aisle detections that only clip the edge of a zone.
    const peopleByTable = groupByZone(people, PERSON_MIN_OVERLAP);
    const chairsByTable = groupByZone(chairs, CHAIR_MIN_OVERLAP);
    const unattendedSeconds = effectiveUnattendedSeconds(this.config.unattendedSeconds, this.mode);

    this.tables = this.tables.map((current) => {
      const tablePeople = peopleByTable.get(current.id) ?? [];
      const tableChairs = (chairsByTable.get(current.id) ?? [])
        .sort((a, b) => centerX(a) - centerX(b) || centerY(a) - centerY(b));
      const table = { ...current, seats: assignSeats(current.id, tablePeople, tableChairs) };

      const result = advanceTableState(table, tablePeople.length > 0, now, this.config.debounceSeconds, unattendedSeconds);
      if (result.alert) this.recordAlert({ ...result.alert, id: randomUUID(), resolvedAt: null });
      return this.applyHandRaise(result.state, tablePeople, now);
    });
    this.lastDetections = [...people, ...[...chairsByTable.values()].flat()];
    return this.snapshot();
  }

  markStaffVisited(tableId: string, videoTimeSeconds: number): DemoSnapshot {
    const index = this.tables.findIndex((item) => item.id === tableId);
    if (index < 0) throw new Error('Unknown table');
    const now = Math.max(0, videoTimeSeconds);
    this.tables[index] = { ...markStaffVisit(this.tables[index], now), unattendedAlerted: true };
    for (const alert of this.alerts) {
      if (alert.tableId === tableId && alert.resolvedAt === null) alert.resolvedAt = now;
    }
    void this.eventRecorder?.recordStaffVisit(tableId, now, this.mode).catch(() => {});
    return this.snapshot();
  }

  private applyHandRaise(table: DemoTable, tablePeople: Detection[], now: number): DemoTable {
    if (!tablePeople.some(hasRaisedHand)) return { ...table, handRaiseSince: null };
    if (table.handRaiseSince === null) return { ...table, handRaiseSince: now };
    if (!shouldAlertForHandRaise(now - table.handRaiseSince, now >= table.handRaiseCooldownUntil)) return table;
    this.recordAlert({
      id: randomUUID(),
      tableId: table.id,
      tableLabel: table.label,
      type: 'hand_raise',
      occurredAt: now,
      message: `${table.label} needs assistance (hand raised)`,
      resolvedAt: null,
    });
    return { ...table, handRaiseCooldownUntil: now + HAND_RAISE_COOLDOWN_SECONDS, handRaiseSince: null };
  }

  private recordAlert(alert: DemoAlert): void {
    this.alerts.push(alert);
    void this.eventRecorder?.record(alert, this.mode).catch(() => {});
  }
}

function focus(detections: Detection[]): FocusedDetection[] {
  return detections.map((detection) => ({ ...detection, tableId: null, seatId: null }));
}

function groupByZone(detections: FocusedDetection[], minimumOverlap: number): Map<string, FocusedDetection[]> {
  const grouped = new Map<string, FocusedDetection[]>();
  for (const detection of detections) {
    const zone = bestOverlappingZone(detection, minimumOverlap);
    if (!zone) continue;
    grouped.set(zone.id, [...(grouped.get(zone.id) ?? []), detection]);
  }
  return grouped;
}

/** Person boxes fill seats; chairs not covered by a person add vacant seats beyond the configured minimum. */
function assignSeats(tableId: string, tablePeople: FocusedDetection[], tableChairs: FocusedDetection[]) {
  const personCount = tablePeople.length;
  const emptyChairs = tableChairs.filter((chair) => !chairCenterInsidePerson(chair, tablePeople));
  const configuredCapacity = demoZones.find((zone) => zone.id === tableId)?.seatCapacity ?? 0;
  const seatCount = Math.max(configuredCapacity, personCount + emptyChairs.length);

  tablePeople.forEach((person, index) => {
    person.tableId = tableId;
    person.seatId = `seat-${index + 1}`;
  });
  let emptyIndex = 0;
  for (const chair of tableChairs) {
    const matched = tablePeople.findIndex((person) => chairCenterInsidePerson(chair, [person]));
    chair.tableId = tableId;
    chair.seatId = matched >= 0 ? `seat-${matched + 1}` : `seat-${personCount + ++emptyIndex}`;
  }
  return Array.from({ length: seatCount }, (_, index) => ({ id: `seat-${index + 1}`, occupied: index < personCount }));
}

function isPerson(detection: Detection): boolean {
  return detection.label.toLowerCase() === 'person' || detection.label === '0';
}

function isChair(detection: Detection): boolean {
  return detection.label.toLowerCase() === 'chair' || detection.label === '56';
}

function bestOverlappingZone(detection: Detection, minimumOverlap: number) {
  return demoZones
    .map((item) => ({ item, overlap: boxPolygonOverlap(detection, item.polygon) }))
    .filter(({ overlap }) => overlap >= minimumOverlap)
    .sort((a, b) => b.overlap - a.overlap)[0]?.item;
}

function centerX(detection: Detection): number {
  return (detection.x1 + detection.x2) / 2;
}

function centerY(detection: Detection): number {
  return (detection.y1 + detection.y2) / 2;
}

function chairCenterInsidePerson(chair: Detection, people: Detection[]): boolean {
  const x = centerX(chair);
  const y = centerY(chair);
  return people.some((person) => x >= person.x1 && x <= person.x2 && y >= person.y1 && y <= person.y2);
}

/** Share of the detection box that falls inside the zone's bounding rectangle. */
export function boxPolygonOverlap(detection: Detection, polygon: Array<[number, number]>): number {
  const minX = Math.min(...polygon.map(([x]) => x));
  const maxX = Math.max(...polygon.map(([x]) => x));
  const minY = Math.min(...polygon.map(([, y]) => y));
  const maxY = Math.max(...polygon.map(([, y]) => y));
  const width = Math.max(0, Math.min(detection.x2, maxX) - Math.max(detection.x1, minX));
  const height = Math.max(0, Math.min(detection.y2, maxY) - Math.max(detection.y1, minY));
  const boxArea = Math.max(0, detection.x2 - detection.x1) * Math.max(0, detection.y2 - detection.y1);
  return boxArea > 0 ? (width * height) / boxArea : 0;
}
