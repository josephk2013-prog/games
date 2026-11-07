import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bridgeHeight } from './collider.js';
import { bboxOf, dist, pointAlong, pointInRing, polylineLength, projectOntoPolyline } from './geo.js';

function yieldFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function openRing(ring) {
  if (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 0.05) return ring.slice(0, -1);
  return ring;
}

function shapeFromRing(ring) {
  const pts = openRing(ring);
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
  return shape;
}

function layFlat(geometry) {
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function frameSamples(points, width, peak = 0) {
  const total = Math.max(polylineLength(points), 0.001);
  const steps = Math.max(2, Math.ceil(total / 8));
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointAlong(points, t);
    const proj = projectOntoPolyline(points, p[0], p[1]);
    samples.push({
      x: p[0],
      z: p[1],
      y: peak ? bridgeHeight(t, peak) : 0,
      t,
      lx: proj?.lx ?? 0,
      lz: proj?.lz ?? 1,
      tx: proj?.tx ?? 1,
      tz: proj?.tz ?? 0,
      width,
    });
  }
  return samples;
}

function ribbonGeometry(samples, half, yLift = 0) {
  const positions = [];
  const indices = [];
  for (const sample of samples) {
    positions.push(
      sample.x + sample.lx * half,
      sample.y + yLift,
      sample.z + sample.lz * half,
      sample.x - sample.lx * half,
      sample.y + yLift,
      sample.z - sample.lz * half,
    );
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function skirtGeometry(samples, half, drop) {
  const positions = [];
  const indices = [];
  const sides = [1, -1];
  let base = 0;
  for (const side of sides) {
    for (const sample of samples) {
      const x = sample.x + sample.lx * half * side;
      const z = sample.z + sample.lz * half * side;
      positions.push(x, sample.y, z, x, sample.y - drop, z);
    }
    for (let i = 0; i < samples.length - 1; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += samples.length * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function paint(geo, wallHex, roofHex) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  let uv = geo.attributes.uv;
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    geo.setAttribute('uv', uv);
  }
  const colors = new Float32Array(pos.count * 3);
  const wall = new THREE.Color(wallHex);
  const roof = new THREE.Color(roofHex);
  for (let i = 0; i < pos.count; i++) {
    const color = nrm.getY(i) > 0.72 ? roof : wall;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.055, pos.getY(i) * 0.065);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function palette(height) {
  if (height < 12) return [0xd7c4a4, 0xc3ad8c];
  if (height < 30) return [0xc5c7cb, 0x9ea3a8];
  if (height < 70) return [0xb3bec8, 0x909aa3];
  return [0x8eabbd, 0x738894];
}

function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 6; y < 128; y += 16) {
    for (let x = 5; x < 64; x += 12) {
      const roll = rand();
      g.fillStyle = roll > 0.86 ? '#ffe0ad' : roll > 0.2 ? '#9ec4d4' : '#d5dee4';
      g.fillRect(x, y, 7, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function flatMesh(ring, material, y) {
  const geo = layFlat(new THREE.ShapeGeometry(shapeFromRing(ring)));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  return mesh;
}

function waterFacing(center, water, islands) {
  let best = { angle: Math.PI / 2, score: -1 };
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    let score = 0;
    for (const radius of [45, 90, 140]) {
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[1] + Math.sin(angle) * radius;
      const wet = (water || []).some((ring) => pointInRing([x, z], ring));
      const land = (islands || []).some((ring) => pointInRing([x, z], ring));
      if (wet && !land) score += radius;
    }
    if (score > best.score) best = { angle, score };
  }
  return best.angle;
}

function sailGeometry() {
  const cols = 14;
  const stacks = 18;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= cols; i++) {
    const u = i / cols;
    const across = u - 0.5;
    const taper = Math.sin(u * Math.PI);
    for (let j = 0; j <= stacks; j++) {
      const v = j / stacks;
      const arch = Math.sin(v * Math.PI);
      const y = arch * (0.42 + 0.58 * taper);
      const z = v - 0.42;
      const x = across * (0.52 + 0.48 * arch);
      positions.push(x, y, z);
    }
  }
  const row = stacks + 1;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < stacks; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function textSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(12, 18, 24, 0.62)';
  g.fillRect(12, 18, 616, 92);
  g.fillStyle = '#f7f1e6';
  g.font = '600 52px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 320, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(78, 15.6, 1);
  return sprite;
}

function buildWater(data) {
  const bounds = data.bounds;
  const step = 8;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / step);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step);
  const wet = new Uint8Array((cols + 1) * (rows + 1));
  const at = (i, j) => j * (cols + 1) + i;
  const contains = (x, z) => {
    let inside = false;
    for (const ring of data.water || []) {
      if (pointInRing([x, z], ring)) {
        inside = true;
        break;
      }
    }
    if (!inside) return false;
    for (const ring of data.islands || []) if (pointInRing([x, z], ring)) return false;
    return true;
  };
  for (let j = 0; j <= rows; j++) {
    const z = bounds.minZ + j * step;
    for (let i = 0; i <= cols; i++) {
      const x = bounds.minX + i * step;
      if (contains(x, z)) wet[at(i, j)] = 1;
    }
  }
  const index = new Map();
  const positions = [];
  const shores = [];
  function vid(i, j) {
    const key = `${i},${j}`;
    if (index.has(key)) return index.get(key);
    const id = positions.length / 3;
    const x = bounds.minX + i * step;
    const z = bounds.minZ + j * step;
    positions.push(x, 0.07, z);
    let edge = 0;
    if (i === 0 || j === 0 || i === cols || j === rows || !wet[at(i - 1, j)] || !wet[at(i + 1, j)] || !wet[at(i, j - 1)] || !wet[at(i, j + 1)]) {
      edge = 1;
    }
    shores.push(edge);
    index.set(key, id);
    return id;
  }
  const indices = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!wet[at(i, j)] && !wet[at(i + 1, j)] && !wet[at(i, j + 1)] && !wet[at(i + 1, j + 1)]) continue;
      if (!wet[at(i, j)] || !wet[at(i + 1, j)] || !wet[at(i, j + 1)] || !wet[at(i + 1, j + 1)]) continue;
      const a = vid(i, j);
      const b = vid(i + 1, j);
      const c = vid(i, j + 1);
      const d = vid(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('shore', new THREE.Float32BufferAttribute(shores, 1));
  geo.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: new THREE.Vector3(-0.65, 0.5, 0.28).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      in float shore;
      out float vShore;
      out vec3 vNormal;
      out vec3 vWorld;
      void main() {
        vec3 p = position;
        float damp = 1.0 - shore * 0.9;
        float w = damp * (
          sin(p.x * 0.05 + uTime * 1.25) * 0.045 +
          cos(p.z * 0.065 - uTime * 0.95) * 0.03 +
          sin((p.x + p.z) * 0.035 + uTime * 0.55) * 0.02
        );
        float dwx = damp * (
          cos(p.x * 0.05 + uTime * 1.25) * 0.05 * 0.045 +
          cos((p.x + p.z) * 0.035 + uTime * 0.55) * 0.035 * 0.02
        );
        float dwz = damp * (
          sin(p.z * 0.065 - uTime * 0.95) * 0.065 * 0.03 +
          cos((p.x + p.z) * 0.035 + uTime * 0.55) * 0.035 * 0.02
        );
        p.y += w;
        vec3 tangent = vec3(1.0, dwx, 0.0);
        vec3 bitangent = vec3(0.0, dwz, 1.0);
        vNormal = normalize(cross(tangent, bitangent));
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vShore = shore;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uLight;
      in float vShore;
      in vec3 vNormal;
      in vec3 vWorld;
      out vec4 fragColor;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.6);
        float diff = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
        vec3 deep = vec3(0.035, 0.20, 0.30);
        vec3 shallow = vec3(0.20, 0.62, 0.68);
        vec3 col = mix(deep, shallow, fres * 0.75 + 0.12);
        col += diff * vec3(0.10, 0.13, 0.11);
        float spark = pow(max(sin(vWorld.x * 0.72 + vWorld.z * 0.41) * cos(vWorld.z * 0.63 - vWorld.x * 0.2), 0.0), 16.0);
        col += spark * vec3(0.95, 0.92, 0.78) * (1.0 - vShore);
        col = mix(col, vec3(0.82, 0.93, 0.92), vShore * 0.65);
        fragColor = vec4(col, 0.94);
      }
    `,
  });
  return new THREE.Mesh(geo, material);
}

function buildBuildings(data) {
  const tex = windowTexture();
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const podiumMat = new THREE.MeshStandardMaterial({
    color: 0xe6d3b5,
    roughness: 0.84,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const chunks = [];
  const podiums = [];
  let batch = [];
  function flush() {
    if (!batch.length) return;
    const merged = mergeGeometries(batch, false);
    batch.forEach((geo) => geo.dispose());
    batch = [];
    if (merged) chunks.push(merged);
  }
  for (const building of data.buildings || []) {
    if (!building.polygon || building.polygon.length < 4) continue;
    try {
      const height = Math.max(3, building.height || 8);
      const geo = new THREE.ExtrudeGeometry(shapeFromRing(building.polygon), { depth: height, bevelEnabled: false });
      layFlat(geo);
      if (building.kind === 'landmark') {
        podiums.push(geo);
      } else {
        const [wall, roof] = palette(height);
        paint(geo, wall, roof);
        batch.push(geo);
        if (batch.length >= 180) flush();
      }
    } catch {
      // Skip a self-intersecting footprint rather than failing the whole city.
    }
  }
  flush();
  const group = new THREE.Group();
  const occluders = [];
  if (chunks.length) {
    const city = mergeGeometries(chunks, false);
    chunks.forEach((geo) => geo.dispose());
    if (city) {
      const mesh = new THREE.Mesh(city, material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      occluders.push(mesh);
    }
  }
  if (podiums.length) {
    const podium = mergeGeometries(podiums, false);
    podiums.forEach((geo) => geo.dispose());
    if (podium) {
      const mesh = new THREE.Mesh(podium, podiumMat);
      group.add(mesh);
      occluders.push(mesh);
    }
  }
  return { group, occluders };
}

function buildShells(data) {
  const landmark = data.landmarks?.operaHouse;
  if (!landmark?.parts?.length) return null;
  const center = landmark.centroid || [0, 0];
  const box = bboxOf(landmark.parts);
  const span = Math.max(box.maxX - box.minX, box.maxZ - box.minZ, 40);
  const angle = waterFacing(center, data.water, data.islands);
  const group = new THREE.Group();
  group.position.set(center[0] - Math.cos(angle) * span * 0.06, 6.2, center[1] - Math.sin(angle) * span * 0.06);
  group.rotation.y = Math.PI / 2 - angle;
  const geo = sailGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xf6f3ee,
    roughness: 0.32,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const specs = [
    [-0.34, 0.02, 0.92, 0.78, 0.7],
    [-0.02, -0.04, 1.15, 1.05, 0.86],
    [0.32, 0.05, 0.84, 0.7, 0.66],
    [0.08, 0.28, 0.62, 0.5, 0.5],
  ];
  const unit = Math.min(span, 200);
  for (const [x, z, sx, sy, sz] of specs) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x * unit * 0.7, 0, z * unit * 0.26);
    mesh.scale.set(unit * sx * 0.33, unit * sy * 0.3, unit * sz * 0.28);
    group.add(mesh);
  }
  const label = textSprite(data.synthetic ? 'Synthetic shells' : 'Sydney Opera House');
  label.position.set(0, unit * 0.4, 0);
  group.add(label);
  return group;
}

function buildBridge(data) {
  const bridge = data.bridge;
  if (!bridge?.points || bridge.points.length < 2) return new THREE.Group();
  const group = new THREE.Group();
  const samples = frameSamples(bridge.points, bridge.width, bridge.peak);
  const half = bridge.width / 2;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6d767f, roughness: 0.45, metalness: 0.42, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ color: 0xb7aa96, roughness: 0.8, metalness: 0.04 });
  const paintLine = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.6 });
  const deck = new THREE.Mesh(ribbonGeometry(samples, half, 0.12), asphalt);
  const girder = new THREE.Mesh(skirtGeometry(samples, half * 0.96, 1.5), steel);
  group.add(deck, girder);
  for (const offset of [-0.28, -0.08, 0.08, 0.28]) {
    const shifted = samples.map((sample) => ({
      ...sample,
      x: sample.x + sample.lx * bridge.width * offset,
      z: sample.z + sample.lz * bridge.width * offset,
    }));
    group.add(new THREE.Mesh(ribbonGeometry(shifted, 0.18, 0.2), paintLine));
  }

  const archSamples = samples.filter((sample) => sample.t > 0.16 && sample.t < 0.84);
  const rise = bridge.archRise || 48;
  function archLine(lateral) {
    return archSamples.map((sample) => {
      const u = (sample.t - 0.16) / 0.68;
      const y = sample.y + Math.sin(Math.PI * Math.max(0, Math.min(1, u))) * rise;
      return {
        ...sample,
        y,
        x: sample.x + sample.lx * lateral,
        z: sample.z + sample.lz * lateral,
      };
    });
  }
  for (const lateral of [half * 0.72, -half * 0.72]) {
    const line = archLine(lateral);
    group.add(new THREE.Mesh(ribbonGeometry(line, 1.15, 0), steel));
    const lower = line.map((sample) => ({ ...sample, y: sample.y - 3.2 }));
    group.add(new THREE.Mesh(ribbonGeometry(lower, 0.7, 0), steel));
    for (let i = 0; i < line.length; i += 2) {
      const top = line[i];
      const deckY = archSamples[i].y;
      const gap = top.y - deckY;
      if (gap < 4) continue;
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.28, gap, 0.28), steel);
      hanger.position.set(top.x, deckY + gap / 2, top.z);
      group.add(hanger);
    }
  }

  for (const t of [0.18, 0.82]) {
    const p = pointAlong(bridge.points, t);
    const proj = projectOntoPolyline(bridge.points, p[0], p[1]);
    const deckY = bridgeHeight(t, bridge.peak);
    const pylonH = deckY + 26;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(16, pylonH, 26), stone);
    pylon.position.set(p[0], pylonH / 2, p[1]);
    if (proj) pylon.rotation.y = Math.atan2(proj.tx, proj.tz);
    group.add(pylon);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(20, 3.2, 30), stone);
    cap.position.set(p[0], pylonH + 1.2, p[1]);
    if (proj) cap.rotation.y = pylon.rotation.y;
    group.add(cap);
  }

  const label = textSprite(data.synthetic ? 'Synthetic arch' : 'Sydney Harbour Bridge');
  const crest = pointAlong(bridge.points, 0.5);
  label.position.set(crest[0], bridge.peak + (bridge.archRise || 40) + 18, crest[1]);
  group.add(label);
  return group;
}

function buildVegetation(data) {
  const trunks = [];
  const leaves = [];
  let budget = 90;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const park of data.parks || []) {
    if (budget <= 0) break;
    const box = bboxOf([park.polygon]);
    const tries = 18;
    for (let i = 0; i < tries && budget > 0; i++) {
      const x = box.minX + rand() * (box.maxX - box.minX);
      const z = box.minZ + rand() * (box.maxZ - box.minZ);
      if (!pointInRing([x, z], park.polygon)) continue;
      const wet = (data.water || []).some((ring) => pointInRing([x, z], ring));
      if (wet) continue;
      const h = 4 + rand() * 5;
      const trunk = new THREE.CylinderGeometry(0.18, 0.28, h * 0.45, 5);
      trunk.translate(x, h * 0.22, z);
      trunks.push(trunk);
      const crown = new THREE.SphereGeometry(1.3 + rand() * 1.1, 7, 6);
      crown.translate(x, h * 0.62, z);
      leaves.push(crown);
      budget -= 1;
    }
  }
  const group = new THREE.Group();
  if (trunks.length) {
    group.add(new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 })));
    trunks.forEach((geo) => geo.dispose());
  }
  if (leaves.length) {
    group.add(new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 0.85 })));
    leaves.forEach((geo) => geo.dispose());
  }
  return group;
}

function buildFerry(data) {
  let best = null;
  for (const pier of data.piers || []) {
    const length = polylineLength(pier.points);
    if (!best || length > best.length) best = { pier, length };
  }
  if (!best) return null;
  const mid = best.pier.points[Math.floor(best.pier.points.length / 2)];
  const proj = projectOntoPolyline(best.pier.points, mid[0], mid[1]);
  if (!proj) return null;
  let spot = null;
  for (const sign of [1, -1]) {
    for (const distM of [16, 24, 34]) {
      const x = mid[0] + proj.lx * distM * sign;
      const z = mid[1] + proj.lz * distM * sign;
      const wet = (data.water || []).some((ring) => pointInRing([x, z], ring));
      if (wet) {
        spot = { x, z, yaw: Math.atan2(proj.tx, proj.tz) };
        break;
      }
    }
    if (spot) break;
  }
  if (!spot) return null;
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(26, 3.4, 7.4),
    new THREE.MeshStandardMaterial({ color: 0xf4f7f8, roughness: 0.45, metalness: 0.08 }),
  );
  hull.position.y = 1.1;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(26.2, 0.7, 7.6),
    new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.5 }),
  );
  stripe.position.y = 1.8;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(10, 2.6, 5.4),
    new THREE.MeshStandardMaterial({ color: 0xe7eef2, roughness: 0.4 }),
  );
  cabin.position.set(-1.5, 3.4, 0);
  group.add(hull, stripe, cabin);
  group.position.set(spot.x, -0.2, spot.z);
  group.rotation.y = spot.yaw;
  return group;
}

export async function buildWorld(scene, data, onProgress) {
  onProgress?.('Lighting the harbour…');
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 28, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      glslVersion: THREE.GLSL3,
      vertexShader: 'out vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        in vec3 vPos;
        out vec4 fragColor;
        void main() {
          vec3 dir = normalize(vPos);
          float h = dir.y;
          vec3 top = vec3(0.33, 0.56, 0.86);
          vec3 mid = vec3(0.93, 0.62, 0.40);
          vec3 horizon = vec3(0.99, 0.84, 0.68);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.16, h));
          col = mix(col, top, smoothstep(0.08, 0.55, h));
          vec3 sunDir = normalize(vec3(-0.78, 0.34, 0.22));
          float sun = pow(max(dot(dir, sunDir), 0.0), 220.0);
          col += sun * vec3(1.0, 0.78, 0.42);
          fragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xf3d3b2, 140, 1750);
  scene.add(new THREE.HemisphereLight(0xc9e2ff, 0x8d7c62, 0.92));
  const sun = new THREE.DirectionalLight(0xffc89a, 2.45);
  sun.position.set(-220, 110, 80);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9ec4ff, 0.35);
  fill.position.set(160, 60, -90);
  scene.add(fill);

  const bounds = data.bounds;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(bounds.maxX - bounds.minX + 40, bounds.maxZ - bounds.minZ + 40),
    new THREE.MeshStandardMaterial({ color: 0xcbbda8, roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const parkMat = new THREE.MeshStandardMaterial({ color: 0x6d8b49, roughness: 0.95 });
  for (const park of data.parks || []) {
    try {
      scene.add(flatMesh(park.polygon, parkMat, 0.03));
    } catch {
      /* ignore a broken park ring */
    }
  }
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0xe5d9c8, roughness: 0.9 });
  for (const plaza of data.plazas || []) {
    try {
      scene.add(flatMesh(plaza.polygon, plazaMat, 0.05));
    } catch {
      /* ignore */
    }
  }
  const islandMat = new THREE.MeshStandardMaterial({ color: 0xc6b494, roughness: 0.88, side: THREE.DoubleSide });
  for (const ring of data.islands || []) {
    try {
      const geo = new THREE.ExtrudeGeometry(shapeFromRing(ring), { depth: 3.5, bevelEnabled: false });
      layFlat(geo);
      scene.add(new THREE.Mesh(geo, islandMat));
    } catch {
      /* ignore */
    }
  }

  onProgress?.('Pouring the water…');
  await yieldFrame();
  const water = buildWater(data);
  scene.add(water);

  const roadMat = {
    fast: new THREE.MeshStandardMaterial({ color: 0x3e4652, roughness: 0.92, side: THREE.DoubleSide }),
    street: new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.9, side: THREE.DoubleSide }),
    walk: new THREE.MeshStandardMaterial({ color: 0x7a7166, roughness: 0.86, side: THREE.DoubleSide }),
    line: new THREE.MeshStandardMaterial({ color: 0xd7c36a, roughness: 0.6, side: THREE.DoubleSide }),
  };
  const roadBatches = { fast: [], street: [], walk: [], line: [] };
  for (const road of data.roads || []) {
    if (road.coveredByHarbourDeck || road.points.length < 2) continue;
    const peak = road.bridge ? road.peak || 6 : 0;
    const samples = frameSamples(road.points, road.width, peak);
    const yLift = peak ? 0.22 : 0.2;
    const kind = /pedestrian|living_street/.test(road.class) ? 'walk' : /motorway|trunk|primary/.test(road.class) ? 'fast' : 'street';
    roadBatches[kind].push(ribbonGeometry(samples, (road.width || 6) / 2, yLift));
    if (kind === 'fast') roadBatches.line.push(ribbonGeometry(samples, 0.12, yLift + 0.05));
  }
  for (const kind of Object.keys(roadBatches)) {
    if (!roadBatches[kind].length) continue;
    const merged = mergeGeometries(roadBatches[kind], false);
    roadBatches[kind].forEach((geo) => geo.dispose());
    if (merged) scene.add(new THREE.Mesh(merged, roadMat[kind]));
  }

  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8d7356, roughness: 0.82 });
  for (const pier of data.piers || []) {
    if (pier.points.length < 2) continue;
    const samples = frameSamples(pier.points, 8, 0);
    scene.add(new THREE.Mesh(ribbonGeometry(samples, 4, 0.18), pierMat));
  }

  onProgress?.('Raising the city…');
  await yieldFrame();
  const buildings = buildBuildings(data);
  scene.add(buildings.group);
  scene.add(buildVegetation(data));
  const shells = buildShells(data);
  if (shells) scene.add(shells);
  scene.add(buildBridge(data));
  const ferry = buildFerry(data);
  if (ferry) scene.add(ferry);

  const markers = [];
  const ringGeo = new THREE.TorusGeometry(11, 0.42, 8, 28);
  ringGeo.rotateX(Math.PI / 2);
  (data.mission?.checkpoints || []).forEach((cp, index) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf0c14a,
      emissive: 0xc47d12,
      emissiveIntensity: 0.7,
      roughness: 0.32,
      metalness: 0.18,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    const group = new THREE.Group();
    group.add(mesh);
    group.position.set(cp.x, 1.5, cp.z);
    scene.add(group);
    markers.push({ group, mesh, mat, index });
  });

  return { water, occluders: buildings.occluders, markers };
}
