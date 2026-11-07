import { clamp, pointInBounds, pointInRing, projectOntoPolyline } from './geo.js';

function cellKey(x, z, cell) {
  return `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
}

function pushGrid(grid, x, z, item, cell) {
  const key = cellKey(x, z, cell);
  let bucket = grid.get(key);
  if (!bucket) grid.set(key, (bucket = []));
  bucket.push(item);
}

function nearby(grid, x, z, cell) {
  const ix = Math.floor(x / cell);
  const iz = Math.floor(z / cell);
  const out = [];
  const seen = new Set();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${ix + dx},${iz + dz}`);
      if (!bucket) continue;
      for (const item of bucket) {
        if (seen.has(item)) continue;
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

export function bridgeHeight(t, peak) {
  return peak * Math.sin(Math.PI * clamp(t, 0, 1));
}

export function createCollider(data) {
  const cell = 48;
  const roadGrid = new Map();
  const buildingGrid = new Map();
  const buildings = data.buildings || [];

  for (const road of data.roads || []) {
    const width = road.width || 6;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const seg = { a, b, road, width };
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len / cell));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pushGrid(roadGrid, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, seg, cell);
      }
    }
  }

  for (const building of buildings) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of building.polygon) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
    const record = { building, minX, maxX, minZ, maxZ };
    const step = cell;
    for (let x = minX; x <= maxX + 0.1; x += step) {
      for (let z = minZ; z <= maxZ + 0.1; z += step) pushGrid(buildingGrid, x, z, record, cell);
    }
    pushGrid(buildingGrid, maxX, maxZ, record, cell);
  }

  const elevations = data.elevations || [];
  const bounds = data.bounds;

  function inWater(x, z) {
    let wet = false;
    for (const ring of data.water || []) {
      if (pointInRing([x, z], ring)) {
        wet = true;
        break;
      }
    }
    if (!wet) return false;
    for (const ring of data.islands || []) {
      if (pointInRing([x, z], ring)) return false;
    }
    return true;
  }

  function blocked(x, z) {
    const list = nearby(buildingGrid, x, z, cell);
    for (const record of list) {
      if (x < record.minX - 0.4 || x > record.maxX + 0.4 || z < record.minZ - 0.4 || z > record.maxZ + 0.4) continue;
      if (pointInRing([x, z], record.building.polygon)) return true;
    }
    return false;
  }

  function nearestRoad(x, z) {
    let best = null;
    for (const seg of nearby(roadGrid, x, z, cell)) {
      const proj = projectOntoPolyline([seg.a, seg.b], x, z);
      if (!proj) continue;
      if (!best || proj.dist < best.dist) best = { ...proj, road: seg.road, width: seg.width };
    }
    return best;
  }

  function elevationAt(x, z) {
    let best = null;
    for (const entry of elevations) {
      const proj = projectOntoPolyline(entry.points, x, z);
      if (!proj) continue;
      const half = (entry.width || 20) * 0.5;
      if (proj.dist > half + 4) continue;
      const height = bridgeHeight(proj.t, entry.peak || 0);
      const edge = proj.dist - half;
      const candidate = { entry, proj, height, edge, half };
      if (!best || proj.dist < best.proj.dist) best = candidate;
    }
    return best;
  }

  function sample(x, z) {
    if (bounds && !pointInBounds([x, z], bounds, 18)) {
      return { blocked: false, water: false, fall: false, out: true, height: 0, grip: 1, bridge: false };
    }

    const road = nearestRoad(x, z);
    const onGroundRoad = road && road.dist < Math.max(3.2, road.width * 0.55) && !road.road.coveredByHarbourDeck;
    const elev = elevationAt(x, z);

    if (elev && elev.entry.kind === 'harbour' && elev.height > 10 && elev.edge > 0.6 && elev.edge < 3.2) {
      return { blocked: false, water: false, fall: true, out: false, height: 0, grip: 1, bridge: false };
    }

    let height = 0;
    let bridge = false;
    if (onGroundRoad && road.road.bridge && road.road.peak) {
      const along = projectOntoPolyline(road.road.points, x, z);
      height = along ? bridgeHeight(along.t, road.road.peak) : 0;
    } else if (!onGroundRoad && elev && elev.proj.dist <= elev.half) {
      height = elev.height;
      bridge = elev.entry.kind === 'harbour';
    } else if (onGroundRoad && elev && elev.entry.kind !== 'harbour' && elev.proj.dist <= elev.half && road.road.bridge) {
      height = elev.height;
    }

    const highDeck = bridge && height > 4;
    if (!highDeck && blocked(x, z)) {
      return { blocked: true, water: false, fall: false, out: false, height: 0, grip: 1, bridge: false };
    }

    const water = !bridge && height < 1.2 && inWater(x, z);
    return {
      blocked: false,
      water,
      fall: false,
      out: false,
      height,
      grip: water ? 0.25 : 1,
      bridge,
    };
  }

  return { sample, inWater, blocked, nearestRoad };
}
