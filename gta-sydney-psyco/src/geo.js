/** Local tangent projection and polygon helpers. x = east metres, z = north metres. */

export function metersPerDegree(latDeg) {
  const lat = (latDeg * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
  const mPerDegLon = 111412.84 * Math.cos(lat) - 93.5 * Math.cos(3 * lat);
  return { mPerDegLat, mPerDegLon };
}

export function project(lon, lat, origin) {
  const { mPerDegLat, mPerDegLon } = metersPerDegree(origin.lat);
  return [(lon - origin.lon) * mPerDegLon, (lat - origin.lat) * mPerDegLat];
}

export function unproject(x, z, origin) {
  const { mPerDegLat, mPerDegLon } = metersPerDegree(origin.lat);
  return {
    lon: origin.lon + x / mPerDegLon,
    lat: origin.lat + z / mPerDegLat,
  };
}

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function ringOpen(ring) {
  if (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-6) return ring.slice(0, -1);
  return ring;
}

export function ringArea(ring) {
  const pts = ringOpen(ring);
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    sum += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return sum / 2;
}

export function pointInRing(point, ring) {
  const x = point[0];
  const z = point[1];
  const pts = ringOpen(ring);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const zi = pts[i][1];
    const xj = pts[j][0];
    const zj = pts[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return dist(p, a);
  return Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len;
}

export function simplify(points, epsilon) {
  if (!points || points.length < 3) return points ? points.map((p) => p.slice()) : [];
  const closed = dist(points[0], points[points.length - 1]) < 0.05;
  const work = closed ? points.slice(0, -1) : points;
  if (work.length < 3) return points.map((p) => p.slice());
  const kept = rdp(work.map((p) => p.slice()), epsilon);
  if (closed) {
    if (kept.length < 3) return points.map((p) => p.slice());
    kept.push(kept[0].slice());
  }
  return kept;
}

function rdp(points, epsilon) {
  let maxD = 0;
  let idx = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a.slice(), b.slice()];
}

export function decimate(points, maxPoints) {
  if (points.length <= maxPoints) return points.map((p) => p.slice());
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i].slice());
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > 0) out.push(last.slice());
  return out;
}

function edgeIntersect(a, b, value, axis) {
  const tAxis = axis === 'x' ? 0 : 1;
  const oAxis = axis === 'x' ? 1 : 0;
  const denom = b[tAxis] - a[tAxis];
  const t = denom === 0 ? 0 : (value - a[tAxis]) / denom;
  const p = [0, 0];
  p[tAxis] = value;
  p[oAxis] = a[oAxis] + (b[oAxis] - a[oAxis]) * t;
  return p;
}

/** Sutherland–Hodgman clip against an axis-aligned metre box. */
export function clipPolygon(poly, bounds) {
  if (!poly || poly.length < 3) return [];
  const edges = [
    { inside: (p) => p[0] >= bounds.minX, hit: (a, b) => edgeIntersect(a, b, bounds.minX, 'x') },
    { inside: (p) => p[0] <= bounds.maxX, hit: (a, b) => edgeIntersect(a, b, bounds.maxX, 'x') },
    { inside: (p) => p[1] >= bounds.minZ, hit: (a, b) => edgeIntersect(a, b, bounds.minZ, 'z') },
    { inside: (p) => p[1] <= bounds.maxZ, hit: (a, b) => edgeIntersect(a, b, bounds.maxZ, 'z') },
  ];
  let output = ringOpen(poly).map((p) => p.slice());
  for (const edge of edges) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = edge.inside(cur);
      const prevIn = edge.inside(prev);
      if (curIn) {
        if (!prevIn) output.push(edge.hit(prev, cur));
        output.push(cur);
      } else if (prevIn) {
        output.push(edge.hit(prev, cur));
      }
    }
  }
  return output.length >= 3 ? output : [];
}

export function pointInBounds(p, bounds, margin = 0) {
  return p[0] >= bounds.minX - margin && p[0] <= bounds.maxX + margin && p[1] >= bounds.minZ - margin && p[1] <= bounds.maxZ + margin;
}

export function clipPolyline(points, bounds, margin = 0) {
  const parts = [];
  let cur = [];
  for (const p of points) {
    if (pointInBounds(p, bounds, margin)) cur.push(p.slice());
    else if (cur.length) {
      if (cur.length >= 2) parts.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) parts.push(cur);
  return parts;
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += dist(points[i], points[i + 1]);
  return total;
}

export function closestOnSegment(a, b, x, z) {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz || 1e-12;
  let t = ((x - a[0]) * abx + (z - a[1]) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + abx * t, a[1] + abz * t, t];
}

export function projectOntoPolyline(points, x, z) {
  if (!points || points.length < 2) return null;
  let best = null;
  let walked = 0;
  const total = polylineLength(points) || 1;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cp = closestOnSegment(a, b, x, z);
    const d = Math.hypot(cp[0] - x, cp[1] - z);
    const segLen = dist(a, b);
    const alongSeg = segLen * cp[2];
    if (!best || d < best.dist) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      best = {
        x: cp[0],
        z: cp[1],
        dist: d,
        along: walked + alongSeg,
        t: (walked + alongSeg) / total,
        segIndex: i,
        tx: dx / len,
        tz: dz / len,
        lx: -dz / len,
        lz: dx / len,
      };
    }
    walked += segLen;
  }
  return best;
}

export function pointAlong(points, t) {
  const target = polylineLength(points) * Math.max(0, Math.min(1, t));
  let walked = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = dist(points[i], points[i + 1]);
    if (walked + seg >= target || i === points.length - 2) {
      const u = seg === 0 ? 0 : (target - walked) / seg;
      const clamped = Math.max(0, Math.min(1, u));
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * clamped,
        points[i][1] + (points[i + 1][1] - points[i][1]) * clamped,
      ];
    }
    walked += seg;
  }
  return points[points.length - 1].slice();
}

export function offsetPolyline(points, lateral) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    out.push([points[i][0] + -dz * lateral, points[i][1] + dx * lateral]);
  }
  return out;
}

export function chainLines(lines, epsilon = 2) {
  const unused = lines.filter((line) => line.length >= 2).map((line) => line.map((p) => p.slice()));
  const rings = [];
  const chains = [];
  while (unused.length) {
    let chain = unused.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = unused.length - 1; i >= 0; i--) {
        const line = unused[i];
        const a = chain[0];
        const b = chain[chain.length - 1];
        const c = line[0];
        const d = line[line.length - 1];
        if (dist(b, c) <= epsilon) {
          chain = chain.concat(line.slice(1));
          unused.splice(i, 1);
          grew = true;
        } else if (dist(b, d) <= epsilon) {
          chain = chain.concat(line.slice(0, -1).reverse());
          unused.splice(i, 1);
          grew = true;
        } else if (dist(a, d) <= epsilon) {
          chain = line.concat(chain.slice(1));
          unused.splice(i, 1);
          grew = true;
        } else if (dist(a, c) <= epsilon) {
          chain = line.slice().reverse().concat(chain.slice(1));
          unused.splice(i, 1);
          grew = true;
        }
      }
    }
    if (dist(chain[0], chain[chain.length - 1]) <= Math.max(epsilon, 3)) {
      chain[chain.length - 1] = chain[0].slice();
      rings.push(chain);
    } else chains.push(chain);
  }
  return { rings, chains };
}

export function centroid(ring) {
  const pts = ringOpen(ring);
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += cross;
    cx += (pts[j][0] + pts[i][0]) * cross;
    cz += (pts[j][1] + pts[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0;
    let sz = 0;
    for (const p of pts) {
      sx += p[0];
      sz += p[1];
    }
    return [sx / pts.length, sz / pts.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function bboxOf(rings) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

export function boundsFromOrigin(south, west, north, east, origin) {
  const corners = [
    project(west, south, origin),
    project(east, south, origin),
    project(west, north, origin),
    project(east, north, origin),
  ];
  return {
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minZ: Math.min(...corners.map((c) => c[1])),
    maxZ: Math.max(...corners.map((c) => c[1])),
  };
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function hashString(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
