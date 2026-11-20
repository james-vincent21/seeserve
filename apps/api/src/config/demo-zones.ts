import type { Zone } from '../domain/demo/demo-session.js';

/** Replace these normalized polygons with coordinates matching the staged demo clip. */
export const demoZones: Zone[] = [
  { id: 'table-1', label: 'Table 1', polygon: [[0.04, 0.2], [0.31, 0.2], [0.31, 0.48], [0.04, 0.48]] },
  { id: 'table-2', label: 'Table 2', polygon: [[0.36, 0.2], [0.63, 0.2], [0.63, 0.48], [0.36, 0.48]] },
  { id: 'table-3', label: 'Table 3', polygon: [[0.68, 0.2], [0.96, 0.2], [0.96, 0.48], [0.68, 0.48]] },
  { id: 'table-4', label: 'Table 4', polygon: [[0.04, 0.55], [0.31, 0.55], [0.31, 0.85], [0.04, 0.85]] },
  { id: 'table-5', label: 'Table 5', polygon: [[0.36, 0.55], [0.63, 0.55], [0.63, 0.85], [0.36, 0.85]] },
  { id: 'table-6', label: 'Table 6', polygon: [[0.68, 0.55], [0.96, 0.55], [0.96, 0.85], [0.68, 0.85]] },
];
