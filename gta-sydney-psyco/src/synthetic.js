/** Rectangular basin used only when the sourced harbour file cannot be loaded. */

export function syntheticHarbour() {
  const water = [[
    [-90, -280],
    [90, -280],
    [130, -20],
    [90, 260],
    [-90, 260],
    [-130, -20],
  ]];
  const bridgePoints = [
    [-220, 30],
    [-120, 36],
    [0, 42],
    [120, 36],
    [220, 30],
  ];
  const opera = [[
    [150, -70],
    [230, -40],
    [240, 20],
    [170, 55],
    [120, 10],
    [125, -45],
  ]];
  const roads = [
    {
      osmId: 0,
      name: 'Synthetic Quay Road',
      class: 'primary',
      width: 12,
      bridge: false,
      coveredByHarbourDeck: false,
      peak: 0,
      points: [[-200, -120], [-40, -110], [80, -95], [160, -70]],
    },
    {
      osmId: 0,
      name: 'Synthetic Span',
      class: 'primary',
      width: 12,
      bridge: true,
      coveredByHarbourDeck: true,
      peak: 18,
      points: bridgePoints.map((p) => p.slice()),
    },
  ];
  return {
    synthetic: true,
    meta: {
      source: 'synthetic',
      synthetic: true,
      license: 'CC0-1.0',
      attribution: 'Synthetic geometry generated for offline fallback. Not OpenStreetMap. Not Sydney Harbour.',
      title: 'Synthetic demo basin',
      retrieved: null,
      limits: [
        'This map is a fabricated basin. It is not Sydney Harbour, not a coastline extract, and not survey data.',
        'The arch and shell shapes here are placeholders so the game remains playable if harbour.json fails to load.',
      ],
    },
    origin: { lon: 0, lat: 0 },
    bbox: [0, 0, 0, 0],
    bounds: { minX: -260, maxX: 280, minZ: -320, maxZ: 300 },
    water,
    islands: [],
    coastline: [],
    roads,
    buildings: [
      {
        osmId: 1,
        name: 'Synthetic block',
        height: 18,
        heightSource: 'estimated',
        kind: 'yes',
        polygon: [[-40, -160], [20, -160], [20, -130], [-40, -130]],
      },
    ],
    parks: [],
    plazas: [],
    piers: [],
    landmarks: {
      operaHouse: {
        name: 'Synthetic shell cluster',
        osmIds: [],
        parts: opera,
        centroid: [175, -8],
        sourced: false,
      },
    },
    bridge: {
      name: 'Synthetic arch',
      osmIds: [],
      points: bridgePoints,
      width: 36,
      peak: 18,
      archRise: 28,
      stylizedVertical: true,
      sourced: false,
    },
    elevations: [
      { name: 'Synthetic arch', points: bridgePoints, width: 36, peak: 18, kind: 'harbour' },
    ],
    mission: {
      title: 'Synthetic loop',
      brief: 'Fallback course on a fake basin. This is not a Sydney route.',
      spawn: { name: 'Synthetic start', x: -160, z: -115, heading: 0.15 },
      checkpoints: [
        { id: 'shells', name: 'Synthetic shells', x: 145, z: -55, radius: 26 },
        { id: 'crest', name: 'Synthetic crest', x: 0, z: 42, radius: 28 },
        { id: 'north', name: 'Synthetic north bank', x: 180, z: 40, radius: 26 },
        { id: 'finish', name: 'Synthetic finish', x: -80, z: -112, radius: 24 },
      ],
    },
  };
}
