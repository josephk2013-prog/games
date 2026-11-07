/**
 * Download a small OpenStreetMap extract around Sydney Harbour and write
 * public/data/harbour.json. Requires network. The game ships the processed file
 * so play does not call Overpass.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCollider } from '../src/collider.js';
import {
  bboxOf,
  boundsFromOrigin,
  centroid,
  chainLines,
  clipPolygon,
  clipPolyline,
  decimate,
  dist,
  pointAlong,
  pointInRing,
  polylineLength,
  project,
  projectOntoPolyline,
  offsetPolyline,
  ringArea,
  simplify,
  unproject,
} from '../src/geo.js';
import { roadWidth } from '../src/roads.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/data/harbour.json');
const CACHE = '/tmp/gta-sydney-psyco-osm';

const SOUTH = -33.869;
const WEST = 151.195;
const NORTH = -33.842;
const EAST = 151.228;
const ORIGIN = { lon: (WEST + EAST) / 2, lat: (SOUTH + NORTH) / 2 };
const BBOX = `${SOUTH},${WEST},${NORTH},${EAST}`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

const ANCHORS = {
  water: { lon: 151.214, lat: -33.8518, expect: 'water' },
  cbd: { lon: 151.2075, lat: -33.8662, expect: 'land' },
  northShore: { lon: 151.2088, lat: -33.8438, expect: 'land' },
  opera: { lon: 151.215297, lat: -33.856784 },
  bridge: { lon: 151.2108, lat: -33.8523 },
};

function r2(n) {
  return Math.round(n * 100) / 100;
}

function cleanRing(points) {
  const out = [];
  for (const p of points) {
    const q = [r2(p[0]), r2(p[1])];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== q[0] || prev[1] !== q[1]) out.push(q);
  }
  if (out.length > 2 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    const gap = dist(out[0], out[out.length - 1]);
    if (gap < 4) out.push(out[0].slice());
  }
  return out;
}

function projectGeom(geometry) {
  if (!geometry) return [];
  const pts = [];
  for (const g of geometry) {
    if (!Number.isFinite(g.lon) || !Number.isFinite(g.lat)) continue;
    const p = project(g.lon, g.lat, ORIGIN);
    const prev = pts[pts.length - 1];
    if (!prev || dist(prev, p) > 0.05) pts.push(p);
  }
  return pts;
}

function parseMeters(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/-?[\d.]+/);
  if (!match) return null;
  let n = Number(match[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (text.includes('ft') || text.includes("'")) n *= 0.3048;
  return n;
}

function isPool(tags = {}) {
  const water = tags.water || '';
  return (
    tags.leisure === 'swimming_pool' ||
    water === 'pool' ||
    water === 'swimming_pool' ||
    water === 'fountain' ||
    water === 'wastewater' ||
    tags.amenity === 'fountain'
  );
}

function isOpera(tags = {}) {
  if (tags.amenity === 'parking' || tags.building === 'parking' || tags.parking) return false;
  const name = `${tags.name || ''} ${tags['name:en'] || ''}`;
  return /opera house/i.test(name);
}

function isHarbourBridgeName(tags = {}) {
  const name = `${tags.name || ''} ${tags['name:en'] || ''}`;
  return /harbour bridge|bradfield/i.test(name);
}

async function overpass(name, query) {
  await mkdir(CACHE, { recursive: true });
  const cacheFile = `${CACHE}/${name}.json`;
  if (process.argv.includes('--reprocess')) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
      console.log(`cache ${name} elements=${cached.elements?.length ?? 0}`);
      return cached;
    } catch {
      console.log(`no cache for ${name}, downloading`);
    }
  }
  let lastError = null;
  for (const url of ENDPOINTS) {
    try {
      console.log(`POST ${name} -> ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
          'User-Agent': 'gta-sydney-psyco/1.0 (educational harbour sandbox; local processing)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${url} HTTP ${res.status} ${text.slice(0, 240)}`);
      const json = JSON.parse(text);
      if (json.remark && !json.elements) throw new Error(json.remark);
      await writeFile(cacheFile, JSON.stringify(json));
      console.log(`  elements ${json.elements?.length ?? 0}`);
      return json;
    } catch (error) {
      lastError = error;
      console.warn(`  failed: ${error.message}`);
    }
  }
  throw lastError;
}

function relationRings(rel) {
  const buckets = { outer: [], inner: [] };
  for (const member of rel.members || []) {
    if (member.type && member.type !== 'way') continue;
    const pts = projectGeom(member.geometry);
    if (pts.length < 2) continue;
    const role = member.role === 'inner' ? 'inner' : 'outer';
    buckets[role].push(decimate(pts, 12000));
  }
  const outers = chainLines(buckets.outer, 3).rings;
  const inners = chainLines(buckets.inner, 3).rings;
  return { outers, inners };
}

function prepareRing(points, minArea) {
  if (!points || points.length < 3) return null;
  const simplified = simplify(decimate(points, 8000), 7);
  const clipped = clipPolygon(simplified, bounds());
  if (clipped.length < 3) return null;
  const ring = cleanRing(simplify(clipped, 6));
  if (ring.length < 4) return null;
  if (Math.abs(ringArea(ring)) < minArea) return null;
  return ring;
}

let CACHED_BOUNDS = null;
function bounds() {
  if (!CACHED_BOUNDS) CACHED_BOUNDS = boundsFromOrigin(SOUTH, WEST, NORTH, EAST, ORIGIN);
  return CACHED_BOUNDS;
}

function pointInsideAny(point, rings) {
  return rings.some((ring) => pointInRing(point, ring));
}

function fractionInWater(points, waterRings, islands) {
  if (!points.length) return 0;
  let wet = 0;
  for (const p of points) {
    if (pointInsideAny(p, waterRings) && !pointInsideAny(p, islands)) wet += 1;
  }
  return wet / points.length;
}

async function main() {
  const box = bounds();
  const harbourRel = await overpass(
    'harbour-relation',
    `[out:json][timeout:180];
     relation(1252425);
     out geom;`,
  );
  const localWater = await overpass(
    'local-water',
    `[out:json][timeout:120];
     (
       way["natural"="water"](${BBOX});
       way["water"](${BBOX});
       way["natural"="coastline"](${BBOX});
       relation["natural"="water"](${BBOX});
     );
     out geom;`,
  );
  const roadsJson = await overpass(
    'roads',
    `[out:json][timeout:150];
     way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|pedestrian|service)$"](${BBOX});
     out geom;`,
  );
  const buildingsJson = await overpass(
    'buildings',
    `[out:json][timeout:180];
     (
       way["building"](${BBOX});
       relation["building"](${BBOX});
       way["name"~"Opera House",i](${BBOX});
       relation["name"~"Opera House",i](${BBOX});
     );
     out geom;`,
  );
  const placesJson = await overpass(
    'places',
    `[out:json][timeout:120];
     (
       way["leisure"~"^(park|garden)$"](${BBOX});
       relation["leisure"~"^(park|garden)$"](${BBOX});
       way["man_made"="pier"](${BBOX});
       way["man_made"="breakwater"](${BBOX});
     );
     out geom;`,
  );

  const memberWayIds = new Set();
  const water = [];
  const islands = [];

  function addRelationWater(rel, minArea) {
    for (const member of rel.members || []) if (member.type === 'way' && member.ref) memberWayIds.add(member.ref);
    const { outers, inners } = relationRings(rel);
    for (const ring of outers) {
      const prepared = prepareRing(ring, minArea);
      if (prepared) water.push(prepared);
    }
    for (const ring of inners) {
      const prepared = prepareRing(ring, 200);
      if (prepared) islands.push(prepared);
    }
  }

  for (const el of harbourRel.elements || []) {
    if (el.type === 'relation') addRelationWater(el, 1000);
  }
  for (const el of localWater.elements || []) {
    if (el.type === 'relation' && (el.tags?.natural === 'water' || el.tags?.water)) {
      if (el.id === 1252425) continue;
      addRelationWater(el, 800);
    }
  }

  for (const el of localWater.elements || []) {
    if (el.type !== 'way' || !el.geometry) continue;
    if (memberWayIds.has(el.id)) continue;
    const tags = el.tags || {};
    if (tags.natural === 'coastline') continue;
    if (isPool(tags)) continue;
    const pts = projectGeom(el.geometry);
    if (pts.length < 4 || dist(pts[0], pts[pts.length - 1]) > 3) continue;
    const prepared = prepareRing(pts, 900);
    if (!prepared) continue;
    const c = centroid(prepared);
    if (pointInsideAny(c, water)) continue;
    water.push(prepared);
  }

  const coastline = [];
  for (const el of localWater.elements || []) {
    if (el.type !== 'way' || el.tags?.natural !== 'coastline' || !el.geometry) continue;
    const pts = projectGeom(el.geometry);
    for (const part of clipPolyline(decimate(pts, 8000), box, 0)) {
      const line = cleanRing(simplify(part, 5)).filter((_, index, arr) => index === arr.length - 1 || true);
      const simplified = cleanRing(simplify(part, 5));
      if (simplified.length >= 2 && polylineLength(simplified) > 20) coastline.push(simplified);
    }
  }

  if (!water.length) throw new Error('No water polygons survived clipping. Refusing to invent a coastline.');
  const dedupedWater = [];
  for (const ring of water) {
    const center = centroid(ring);
    const area = Math.abs(ringArea(ring));
    const duplicate = dedupedWater.some((other) => {
      const otherArea = Math.abs(ringArea(other));
      return dist(center, centroid(other)) < 100 && Math.abs(area - otherArea) / Math.max(area, otherArea, 1) < 0.1;
    });
    if (!duplicate) dedupedWater.push(ring);
  }
  water.length = 0;
  water.push(...dedupedWater);

  const operaParts = [];
  const operaIds = [];
  const buildings = [];

  function consumeBuildingElement(el) {
    const tags = el.tags || {};
    const pieces = [];
    if (el.type === 'way') {
      const pts = projectGeom(el.geometry);
      if (pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 4) pieces.push(pts);
    } else if (el.type === 'relation') {
      const { outers } = relationRings(el);
      pieces.push(...outers);
    }
    for (const piece of pieces) {
      const simplified = cleanRing(simplify(decimate(piece, 400), 1.5));
      if (simplified.length < 4) continue;
      const area = Math.abs(ringArea(simplified));
      if (area < 28 || area > 180000) continue;
      const c = centroid(simplified);
      if (c[0] < box.minX - 10 || c[0] > box.maxX + 10 || c[1] < box.minZ - 10 || c[1] > box.maxZ + 10) continue;
      if (isOpera(tags)) {
        operaParts.push(simplified);
        operaIds.push(el.id);
        continue;
      }
      if (tags.location === 'underground' || tags.parking === 'underground') continue;
      const levels = parseMeters(tags['building:levels']);
      const explicit = parseMeters(tags.height) || parseMeters(tags['building:height']);
      let height;
      let heightSource;
      if (explicit) {
        height = Math.max(3.5, Math.min(340, explicit));
        heightSource = 'osm';
      } else if (levels) {
        height = Math.max(3.5, Math.min(340, levels * 3.15));
        heightSource = 'osm';
      } else {
        const seed = (el.id || area) % 7;
        const base = area > 4000 ? 18 : area > 1200 ? 12 : 8;
        height = base + seed;
        heightSource = 'estimated';
      }
      buildings.push({
        osmId: el.id,
        name: tags.name || null,
        height: r2(height),
        heightSource,
        kind: tags.building || 'yes',
        polygon: simplified,
      });
    }
  }

  for (const el of buildingsJson.elements || []) {
    if (el.type === 'way' || el.type === 'relation') consumeBuildingElement(el);
  }

  if (!operaParts.length) {
    throw new Error('Sydney Opera House footprint was not in the extract.');
  }

  const operaCenter = operaParts.reduce(
    (sum, part) => {
      const c = centroid(part);
      return [sum[0] + c[0], sum[1] + c[1]];
    },
    [0, 0],
  ).map((value) => value / operaParts.length);
  const keptBuildings = [];
  for (const building of buildings) {
    const c = centroid(building.polygon);
    if (operaParts.some((part) => pointInRing(c, part))) continue;
    keptBuildings.push(building);
  }
  buildings.length = 0;
  const osmHeights = keptBuildings
    .filter((b) => b.heightSource === 'osm')
    .sort((a, b) => b.height - a.height || Math.abs(ringArea(b.polygon)) - Math.abs(ringArea(a.polygon)));
  const estimated = keptBuildings
    .filter((b) => b.heightSource === 'estimated')
    .sort((a, b) => Math.abs(ringArea(b.polygon)) - Math.abs(ringArea(a.polygon)));
  console.log(`building candidates osm=${osmHeights.length} estimated=${estimated.length}`);
  const limited = osmHeights.concat(estimated).slice(0, 2200);
  buildings.push(...limited);

  for (const part of operaParts) {
    buildings.push({
      osmId: operaIds[0] || 0,
      name: 'Sydney Opera House',
      height: 7,
      heightSource: 'stylized-podium',
      kind: 'landmark',
      polygon: part,
    });
  }

  const roads = [];
  const plazas = [];
  for (const el of roadsJson.elements || []) {
    if (el.type !== 'way' || !el.geometry) continue;
    const tags = el.tags || {};
    const roadClass = tags.highway;
    const pts = projectGeom(el.geometry);
    const parts = clipPolyline(pts, box, 15);
    const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 3;
    const area = closed ? Math.abs(ringArea(pts)) : 0;
    if ((tags.area === 'yes' || roadClass === 'pedestrian') && closed && area > 120 && area < 80000) {
      const clipped = prepareRing(pts, 120);
      if (clipped) {
        plazas.push({
          osmId: el.id,
          name: tags.name || null,
          polygon: clipped,
        });
      }
    }
    for (const part of parts) {
      const line = cleanRing(simplify(part, 2.4));
      if (line.length < 2 || polylineLength(line) < 10) continue;
      const isBridge = tags.bridge === 'yes' || tags.bridge === 'viaduct';
      roads.push({
        osmId: el.id,
        name: tags.name || null,
        class: roadClass,
        width: roadWidth(roadClass),
        bridge: isBridge,
        coveredByHarbourDeck: false,
        peak: 0,
        points: line,
      });
    }
  }

  const carriageways = roads.filter((road) => {
    if (isHarbourBridgeName({ name: road.name })) return polylineLength(road.points) > 80;
    if (!road.bridge) return false;
    const length = polylineLength(road.points);
    if (length < 250) return false;
    return fractionInWater(road.points, water, islands) > 0.2;
  });
  if (!carriageways.length) {
    const named = roads.filter((road) => isHarbourBridgeName({ name: road.name }));
    carriageways.push(...named);
  }
  if (!carriageways.length) throw new Error('No Sydney Harbour Bridge / Bradfield Highway roadway found.');

  carriageways.sort((a, b) => polylineLength(b.points) - polylineLength(a.points));
  const reference = carriageways[0];
  const offsets = [0];
  for (const road of carriageways.slice(1)) {
    let sum = 0;
    let n = 0;
    const step = Math.max(1, Math.floor(road.points.length / 16));
    for (let i = 0; i < road.points.length; i += step) {
      const p = road.points[i];
      const proj = projectOntoPolyline(reference.points, p[0], p[1]);
      if (!proj || proj.dist > 70) continue;
      const vx = p[0] - proj.x;
      const vz = p[1] - proj.z;
      sum += vx * proj.lx + vz * proj.lz;
      n += 1;
    }
    if (n) offsets.push(sum / n);
  }
  const meanOffset = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
  const maxAbs = Math.max(...offsets.map((value) => Math.abs(value - meanOffset)), 0);
  let centerline = cleanRing(simplify(offsetPolyline(reference.points, meanOffset), 2));
  if (centerline.length < 2) centerline = reference.points.map((p) => p.slice());
  const deckWidth = Math.max(40, Math.min(58, maxAbs * 2 + 20));
  const bridgePeak = 30;

  for (const road of roads) {
    const named = isHarbourBridgeName({ name: road.name });
    if (!road.bridge && !named) continue;
    let on = 0;
    for (const p of road.points) {
      const proj = projectOntoPolyline(centerline, p[0], p[1]);
      if (proj && proj.dist < deckWidth * 0.55) on += 1;
    }
    const mostly = on / road.points.length > 0.55;
    if (named || (road.bridge && mostly && polylineLength(road.points) > 70)) {
      road.coveredByHarbourDeck = true;
      road.peak = bridgePeak;
    } else if (road.bridge) {
      const length = polylineLength(road.points);
      road.peak = r2(Math.max(5, Math.min(8, 4 + length / 50)));
    }
  }

  const elevations = [
    {
      name: 'Sydney Harbour Bridge',
      points: centerline,
      width: r2(deckWidth),
      peak: bridgePeak,
      kind: 'harbour',
    },
  ];
  for (const road of roads) {
    if (!road.bridge || road.coveredByHarbourDeck) continue;
    elevations.push({
      name: road.name,
      points: road.points,
      width: r2(road.width + 2),
      peak: road.peak,
      kind: 'overpass',
    });
  }

  const parks = [];
  const piers = [];
  for (const el of placesJson.elements || []) {
    const tags = el.tags || {};
    if (el.type === 'way' && (tags.man_made === 'pier' || tags.man_made === 'breakwater') && el.geometry) {
      const pts = projectGeom(el.geometry);
      for (const part of clipPolyline(pts, box, 5)) {
        const line = cleanRing(simplify(part, 2));
        if (polylineLength(line) > 12) {
          piers.push({ osmId: el.id, name: tags.name || null, points: line, closed: dist(line[0], line[line.length - 1]) < 3 });
        }
      }
      continue;
    }
    const pieces = [];
    if ((tags.leisure === 'park' || tags.leisure === 'garden') && el.type === 'way') {
      const pts = projectGeom(el.geometry);
      if (pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 4) pieces.push(pts);
    } else if ((tags.leisure === 'park' || tags.leisure === 'garden') && el.type === 'relation') {
      pieces.push(...relationRings(el).outers);
    }
    for (const piece of pieces) {
      const ring = prepareRing(piece, 500);
      if (!ring) continue;
      const area = Math.abs(ringArea(ring));
      if (area > 700000) continue;
      parks.push({ osmId: el.id, name: tags.name || null, polygon: ring });
    }
  }

  const bridge = {
    name: 'Sydney Harbour Bridge',
    osmIds: [...new Set(carriageways.map((road) => road.osmId))],
    points: centerline,
    width: r2(deckWidth),
    peak: bridgePeak,
    archRise: 52,
    stylizedVertical: true,
    sourced: true,
    note: 'Plan centerline is averaged from OpenStreetMap bridge roadways. Deck height, arch, and pylons are stylized.',
  };

  const landmark = {
    operaHouse: {
      name: 'Sydney Opera House',
      osmIds: [...new Set(operaIds)],
      parts: operaParts,
      centroid: [r2(operaCenter[0]), r2(operaCenter[1])],
      sourced: true,
      note: 'Footprint polygons are OpenStreetMap. The white shells are original stylized geometry parked on that footprint.',
    },
  };

  const draft = {
    synthetic: false,
    bounds: {
      minX: r2(box.minX),
      maxX: r2(box.maxX),
      minZ: r2(box.minZ),
      maxZ: r2(box.maxZ),
    },
    water,
    islands,
    roads,
    buildings,
    elevations,
    bridge,
    landmarks: landmark,
  };
  const collider = createCollider(draft);

  function landPoint(lon, lat) {
    const [x, z] = project(lon, lat, ORIGIN);
    return { x, z, water: collider.inWater(x, z), blocked: collider.blocked(x, z) };
  }

  const waterProbe = landPoint(ANCHORS.water.lon, ANCHORS.water.lat);
  const cbdProbe = landPoint(ANCHORS.cbd.lon, ANCHORS.cbd.lat);
  const northProbe = landPoint(ANCHORS.northShore.lon, ANCHORS.northShore.lat);
  if (!waterProbe.water) throw new Error(`Harbour probe is not water at ${JSON.stringify(waterProbe)}`);
  if (cbdProbe.water) throw new Error(`CBD probe is water at ${JSON.stringify(cbdProbe)}`);
  if (northProbe.water) throw new Error(`North shore probe is water at ${JSON.stringify(northProbe)}`);

  const [operaRefX, operaRefZ] = project(ANCHORS.opera.lon, ANCHORS.opera.lat, ORIGIN);
  const operaDistance = Math.hypot(operaCenter[0] - operaRefX, operaCenter[1] - operaRefZ);
  if (operaDistance > 220) {
    throw new Error(`Opera House centroid is ${operaDistance.toFixed(0)} m from the reference point.`);
  }
  const mid = pointAlong(centerline, 0.5);
  const [bridgeRefX, bridgeRefZ] = project(ANCHORS.bridge.lon, ANCHORS.bridge.lat, ORIGIN);
  const bridgeDistance = Math.hypot(mid[0] - bridgeRefX, mid[1] - bridgeRefZ);
  if (bridgeDistance > 280) {
    throw new Error(`Bridge midpoint is ${bridgeDistance.toFixed(0)} m from the reference point.`);
  }

  function insideOpera(x, z) {
    return operaParts.some((part) => pointInRing([x, z], part));
  }

  function findForecourt() {
    const preferred = [];
    for (let ring = 0; ring < 10; ring++) {
      const radius = 35 + ring * 8;
      for (let i = 0; i < 36; i++) {
        const angle = (i / 36) * Math.PI * 2;
        const x = operaCenter[0] + Math.cos(angle) * radius;
        const z = operaCenter[1] + Math.sin(angle) * radius;
        if (collider.inWater(x, z) || insideOpera(x, z) || collider.blocked(x, z)) continue;
        const southBonus = -Math.sin(angle);
        preferred.push({ x, z, score: southBonus * 2 - ring * 0.15 });
      }
      if (preferred.length) break;
    }
    preferred.sort((a, b) => b.score - a.score);
    return preferred[0] || { x: operaCenter[0], z: operaCenter[1] - 60 };
  }

  function snapRoad(x, z, predicate) {
    let best = null;
    for (const road of roads) {
      if (road.coveredByHarbourDeck) continue;
      if (predicate && !predicate(road)) continue;
      const proj = projectOntoPolyline(road.points, x, z);
      if (!proj || proj.dist > 70) continue;
      if (collider.blocked(proj.x, proj.z)) continue;
      if (collider.inWater(proj.x, proj.z)) continue;
      if (!best || proj.dist < best.dist) best = { x: proj.x, z: proj.z, dist: proj.dist, road, tx: proj.tx, tz: proj.tz };
    }
    return best;
  }

  const forecourtSeed = findForecourt();
  const forecourtSnap =
    snapRoad(forecourtSeed.x, forecourtSeed.z, (road) => /pedestrian|unclassified|residential|service|primary|tertiary|living_street/.test(road.class)) ||
    snapRoad(forecourtSeed.x, forecourtSeed.z);
  const operaCp = forecourtSnap
    ? { x: r2(forecourtSnap.x), z: r2(forecourtSnap.z) }
    : { x: r2(forecourtSeed.x), z: r2(forecourtSeed.z) };

  const crest = pointAlong(centerline, 0.5);
  const northIsStart = centerline[0][1] > centerline[centerline.length - 1][1];
  let milsons = pointAlong(centerline, northIsStart ? 0.1 : 0.9);
  for (let t = northIsStart ? 0.08 : 0.92; northIsStart ? t < 0.35 : t > 0.65; t += northIsStart ? 0.02 : -0.02) {
    const candidate = pointAlong(centerline, t);
    const sample = collider.sample(candidate[0], candidate[1]);
    if (!sample.blocked && !sample.water && !sample.fall) {
      milsons = candidate;
      if (sample.bridge || sample.height > 2) break;
    }
  }

  const quaySeed = project(151.2086, -33.8614, ORIGIN);
  const quaySnap =
    snapRoad(quaySeed[0], quaySeed[1], (road) => /primary|secondary|tertiary|unclassified|residential|pedestrian/.test(road.class)) ||
    snapRoad(quaySeed[0], quaySeed[1]);
  if (!quaySnap) throw new Error('Could not place a spawn on a Circular Quay road.');

  const spawn = { x: r2(quaySnap.x), z: r2(quaySnap.z) };
  const finishSeed = project(151.2104, -33.8609, ORIGIN);
  const finishSnap = snapRoad(finishSeed[0], finishSeed[1]) || quaySnap;
  let finish = { x: r2(finishSnap.x), z: r2(finishSnap.z) };
  if (Math.hypot(finish.x - spawn.x, finish.z - spawn.z) < 25) {
    finish = {
      x: r2(spawn.x + quaySnap.tx * 35),
      z: r2(spawn.z + quaySnap.tz * 35),
    };
  }

  function headingToward(from, to) {
    return Math.atan2(to.z - from.z, to.x - from.x);
  }

  const checkpoints = [
    { id: 'opera', name: 'Opera House forecourt', x: operaCp.x, z: operaCp.z, radius: 28 },
    { id: 'crest', name: 'Harbour Bridge crest', x: r2(crest[0]), z: r2(crest[1]), radius: 34 },
    { id: 'milsons', name: 'Milsons Point', x: r2(milsons[0]), z: r2(milsons[1]), radius: 30 },
    { id: 'quay', name: 'Circular Quay finish', x: finish.x, z: finish.z, radius: 26 },
  ];

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    const sample = collider.sample(cp.x, cp.z);
    if (sample.blocked || (sample.water && cp.id !== 'crest')) {
      throw new Error(`Checkpoint ${cp.id} is not drivable: ${JSON.stringify(sample)}`);
    }
    const next = checkpoints[i + 1] || checkpoints[0];
    cp.heading = headingToward(cp, next);
  }
  for (let i = 0; i < checkpoints.length; i++) {
    for (let j = i + 1; j < checkpoints.length; j++) {
      const gap = Math.hypot(checkpoints[i].x - checkpoints[j].x, checkpoints[i].z - checkpoints[j].z);
      if (gap < 45) throw new Error(`Checkpoints ${checkpoints[i].id} and ${checkpoints[j].id} are only ${gap.toFixed(0)} m apart.`);
    }
  }

  let wet = 0;
  let samples = 0;
  for (let ix = 0; ix < 46; ix++) {
    for (let iz = 0; iz < 40; iz++) {
      const x = box.minX + ((ix + 0.5) / 46) * (box.maxX - box.minX);
      const z = box.minZ + ((iz + 0.5) / 40) * (box.maxZ - box.minZ);
      samples += 1;
      if (collider.inWater(x, z)) wet += 1;
    }
  }
  const waterFraction = wet / samples;
  if (waterFraction < 0.12 || waterFraction > 0.72) {
    throw new Error(`Water fraction ${waterFraction.toFixed(2)} looks wrong for this harbour crop.`);
  }

  const counts = {
    waterRings: water.length,
    islands: islands.length,
    coastlineLines: coastline.length,
    roads: roads.length,
    namedRoads: roads.filter((road) => road.name).length,
    buildings: buildings.length,
    buildingsWithOsmHeight: buildings.filter((b) => b.heightSource === 'osm').length,
    buildingsEstimatedHeight: buildings.filter((b) => b.heightSource === 'estimated').length,
    parks: parks.length,
    plazas: plazas.length,
    piers: piers.length,
  };

  const data = {
    synthetic: false,
    meta: {
      title: 'Sydney Harbour core',
      source: 'OpenStreetMap',
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      copyrightUrl: 'https://www.openstreetmap.org/copyright',
      retrieved: new Date().toISOString(),
      overpassRelation: 1252425,
      bbox: [WEST, SOUTH, EAST, NORTH],
      origin: ORIGIN,
      waterFraction: r2(waterFraction),
      counts,
      anchors: {
        operaDistanceM: r2(operaDistance),
        bridgeDistanceM: r2(bridgeDistance),
      },
      verticalScale: {
        bridgeDeck: 'stylized sine profile peaking at 30 m so the span meets the ground at both mapped ends',
        bridgeArch: 'original stylized truss, not a surveyed model and not the real 134 m arch',
        operaShells: 'original stylized shells aligned to the OSM footprint',
        estimatedBuildingHeights: 'used only where OSM has neither height nor building:levels',
      },
      imagery: 'No aerial photography and no photogrammetry. Ground colours are procedural.',
      limits: [
        'Road, coastline, water, park, pier, and building footprints are simplified OpenStreetMap geometries for the bbox, not a full-city twin.',
        'OpenStreetMap building footprints with height or building:levels are kept, tallest first, up to 2200. Untagged footprints are omitted instead of being given invented tower heights. If that cap is not full, leftovers get a modest deterministic estimate marked heightSource=estimated.',
        'The Opera House shells and Harbour Bridge arch, pylons, and deck profile are original stylized models. Only their plan position comes from OpenStreetMap.',
        'No Google photogrammetry, no Bing/Maxar imagery, and no Microsoft building-footprint dump.',
        'This file is a derived database under the Open Database License.',
      ],
    },
    origin: ORIGIN,
    bbox: [WEST, SOUTH, EAST, NORTH],
    bounds: draft.bounds,
    water,
    islands,
    coastline,
    roads,
    buildings,
    parks,
    plazas,
    piers,
    landmarks: landmark,
    bridge,
    elevations,
    mission: {
      title: 'Quay Loop',
      brief: 'Drive the gold rings: Opera House forecourt, Harbour Bridge crest, Milsons Point, then back to Circular Quay.',
      spawn: {
        name: 'Circular Quay',
        x: spawn.x,
        z: spawn.z,
        heading: headingToward(spawn, checkpoints[0]),
      },
      checkpoints,
    },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data));
  const bytes = Buffer.byteLength(JSON.stringify(data));
  console.log(JSON.stringify({ out: OUT, bytes, counts, waterFraction, operaDistance, bridgeDistance }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
