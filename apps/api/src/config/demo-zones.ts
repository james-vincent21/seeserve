/** Approximate normalized table zones for the sample clip. */
export const demoZones = [
  {
    id: 'table-1',
    label: 'Table 1',
    seatCapacity: 4,
    polygon: [[0.03, 0.47], [0.41, 0.47], [0.41, 0.96], [0.03, 0.96]] as Array<[number, number]>,
  },
  {
    id: 'table-2',
    label: 'Table 2',
    seatCapacity: 5,
    // Bounded tightly around Table 2 so the walkway on the right is excluded
    polygon: [[0.24, 0.11], [0.60, 0.11], [0.60, 0.58], [0.24, 0.58]] as Array<[number, number]>,
  },
  {
    id: 'table-3',
    label: 'Table 3',
    seatCapacity: 4,
    // Bounded tightly around Table 3 so the top walkway is excluded
    polygon: [[0.52, 0.48], [0.98, 0.48], [0.98, 0.97], [0.52, 0.97]] as Array<[number, number]>,
  },
];

