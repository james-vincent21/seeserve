import { randomUUID } from 'node:crypto';
import type { DemoAlert, DemoSnapshot, DemoTable, FocusedDetection } from '../../domain/demo/demo-types.js';
import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';
import { env } from '../../config/env.js';
import { demoZones } from '../../config/demo-zones.js';

function newTables(): DemoTable[] {
  return demoZones.map((zone) => ({
    id: zone.id,
    label: zone.label,
    status: 'vacant',
    seatedAt: null,
    staffVisited: false,
    unattendedAlerted: false,
    seats: [],
    zone: zone.polygon.map((point) => [...point] as [number, number]),
  }));
}

/** Demo runtime state is in memory. Frame bytes are not retained. */
export class DemoSession {
  private tables = newTables();
  private alerts: DemoAlert[] = [];
  private analyzedFrames = 0;
  private lastDetections: FocusedDetection[] = [];
  constructor(private readonly provider: InferenceProvider) {}

  snapshot(): DemoSnapshot {
    return {
      tables: this.tables.map((table) => ({
        ...table,
        seats: table.seats.map((seat) => ({ ...seat })),
        zone: table.zone.map((point) => [...point] as [number, number]),
      })),
      alerts: this.alerts.slice(-10),
      analyzedFrames: this.analyzedFrames,
      maxFrames: env.DEMO_MAX_FRAMES,
      inferenceMode: env.INFERENCE_MODE,
      detections: this.lastDetections.map((item) => ({ ...item })),
    };
  }

  reset(): DemoSnapshot {
    this.tables = newTables();
    this.alerts = [];
    this.analyzedFrames = 0;
    this.lastDetections = [];
    this.pending.clear();
    return this.snapshot();
  }

  async analyzeFrame(jpegBase64: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
    if (this.analyzedFrames >= env.DEMO_MAX_FRAMES) throw new Error('Frame limit reached. Reset the demo to continue.');
    const detections = await this.provider.detect(jpegBase64);
    this.analyzedFrames += 1;
    const now = Math.max(0, videoTimeSeconds);
    const people: FocusedDetection[] = detections
      .filter((detection) => isPerson(detection) && detection.confidence >= 0.25)
      .map((detection) => ({ ...detection, tableId: null, seatId: null }));
    const chairs: FocusedDetection[] = detections
      .filter((detection) => isChair(detection) && detection.confidence >= 0.25)
      .map((detection) => ({ ...detection, tableId: null, seatId: null }));
    const chairsByTable = new Map<string, FocusedDetection[]>();
    for (const chair of chairs) {
      const zone = bestOverlappingZone(chair);
      if (!zone) continue;
      const tableChairs = chairsByTable.get(zone.id) ?? [];
      tableChairs.push(chair);
      chairsByTable.set(zone.id, tableChairs);
    }
    const peopleByTable = new Map<string, FocusedDetection[]>();
    for (const detection of people) {
      // Full person boxes often include the chair and floor, so their bottom
      // edge can fall outside the table zone even when the guest is seated.
      // Assign each person to the table with the greatest box overlap instead.
      // Ignore aisle detections that only clip the edge of a table zone.
      const zone = bestOverlappingZone(detection, 0.2);
      if (!zone) continue;

      const tablePeople = peopleByTable.get(zone.id) ?? [];
      tablePeople.push(detection);
      peopleByTable.set(zone.id, tablePeople);
    }
    for (const table of this.tables) {
      const tablePeople = peopleByTable.get(table.id) ?? [];
      const tableChairs = chairsByTable.get(table.id) ?? [];
      tableChairs.sort((a, b) => centerX(a) - centerX(b) || centerY(a) - centerY(b));
      const personCount = tablePeople.length;
      const emptyChairs = tableChairs.filter((chair) => !chairCenterInsidePerson(chair, tablePeople));
      const configuredCapacity = demoZones.find((zone) => zone.id === table.id)?.seatCapacity ?? 0;
      const inferredSeatCount = Math.max(configuredCapacity, personCount + emptyChairs.length);

      tablePeople.forEach((person, index) => {
        person.tableId = table.id;
        person.seatId = `seat-${index + 1}`;
      });
      let emptyIndex = 0;
      for (const chair of tableChairs) {
        const matchedPerson = tablePeople.findIndex((person) => chairCenterInsidePerson(chair, [person]));
        chair.tableId = table.id;
        chair.seatId = matchedPerson >= 0
          ? `seat-${matchedPerson + 1}`
          : `seat-${personCount + ++emptyIndex}`;
      }

      table.seats = Array.from({ length: inferredSeatCount }, (_, index) => ({
        id: `seat-${index + 1}`,
        occupied: index < personCount,
      }));
      this.applyOccupancy(table.id, table.seats.some((seat) => seat.occupied), now);
    }
    this.lastDetections = [...people, ...[...chairsByTable.values()].flat()];
    return this.snapshot();
  }

  markStaffVisited(tableId: string, videoTimeSeconds: number): DemoSnapshot {
    const table = this.tables.find((item) => item.id === tableId);
    if (!table) throw new Error('Unknown table');
    table.staffVisited = true;
    table.unattendedAlerted = true;
    void videoTimeSeconds;
    return this.snapshot();
  }

  /** Reserved for the inference integration to apply structured table observations. */
  applyOccupancy(tableId: string, occupied: boolean, videoTimeSeconds: number): DemoAlert | null {
    const table = this.tables.find((item) => item.id === tableId);
    if (!table) return null;
    const nextStatus = occupied ? 'seated' : 'vacant';
    const pending = this.pending.get(tableId);
    if (nextStatus === table.status) {
      this.pending.delete(tableId);
    } else if (!pending || pending.status !== nextStatus) {
      if (env.DEMO_DEBOUNCE_SECONDS === 0) {
        table.status = nextStatus;
        table.seatedAt = occupied ? videoTimeSeconds : null;
        table.staffVisited = false;
        table.unattendedAlerted = false;
        this.pending.delete(tableId);
      } else {
        this.pending.set(tableId, { status: nextStatus, since: videoTimeSeconds });
      }
    } else if (videoTimeSeconds - pending.since >= env.DEMO_DEBOUNCE_SECONDS) {
      table.status = nextStatus;
      table.seatedAt = occupied ? videoTimeSeconds : null;
      table.staffVisited = false;
      table.unattendedAlerted = false;
      this.pending.delete(tableId);
    }

    if (table.status === 'seated' && table.seatedAt !== null && !table.staffVisited &&
        !table.unattendedAlerted && videoTimeSeconds - table.seatedAt >= env.DEMO_UNATTENDED_SECONDS) {
      table.unattendedAlerted = true;
      const alert: DemoAlert = {
        id: randomUUID(), tableId, tableLabel: table.label, type: 'unattended',
        occurredAt: videoTimeSeconds, message: `${table.label} needs service`,
      };
      this.alerts.push(alert);
      return alert;
    }
    return null;
  }

  private pending = new Map<string, { status: 'vacant' | 'seated'; since: number }>();
}

function isPerson(detection: Detection): boolean {
  return detection.label.toLowerCase() === 'person' || detection.label === '0';
}

function isChair(detection: Detection): boolean {
  return detection.label.toLowerCase() === 'chair' || detection.label === '56';
}

function bestOverlappingZone(detection: Detection, minimumOverlap = 0.05) {
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

function boxPolygonOverlap(detection: Detection, polygon: Array<[number, number]>): number {
  const minX = Math.min(...polygon.map(([x]) => x));
  const maxX = Math.max(...polygon.map(([x]) => x));
  const minY = Math.min(...polygon.map(([, y]) => y));
  const maxY = Math.max(...polygon.map(([, y]) => y));
  const width = Math.max(0, Math.min(detection.x2, maxX) - Math.max(detection.x1, minX));
  const height = Math.max(0, Math.min(detection.y2, maxY) - Math.max(detection.y1, minY));
  const boxArea = Math.max(0, detection.x2 - detection.x1) * Math.max(0, detection.y2 - detection.y1);
  return boxArea > 0 ? (width * height) / boxArea : 0;
}

