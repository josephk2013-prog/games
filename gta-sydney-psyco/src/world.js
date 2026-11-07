import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
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

function ribbonGeometry(samples, half, yLift = 0, tile = 4) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let along = 0;
  const across = (half * 2) / tile;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (i > 0) along += Math.hypot(sample.x - samples[i - 1].x, sample.z - samples[i - 1].z);
    const u = along / tile;
    positions.push(
      sample.x + sample.lx * half,
      sample.y + yLift,
      sample.z + sample.lz * half,
      sample.x - sample.lx * half,
      sample.y + yLift,
      sample.z - sample.lz * half,
    );
    uvs.push(u, 0, u, across);
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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

function metreUvs(geo, tileX, tileY) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(nrm.getY(i)) > 0.62) {
      uv[i * 2] = x / tileX;
      uv[i * 2 + 1] = z / tileY;
    } else {
      const along = Math.abs(nrm.getX(i)) > Math.abs(nrm.getZ(i)) ? z : x;
      uv[i * 2] = along / tileX;
      uv[i * 2 + 1] = y / tileY;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function footprintCenter(polygon) {
  let x = 0;
  let z = 0;
  for (const point of polygon) {
    x += point[0];
    z += point[1];
  }
  return [x / polygon.length, z / polygon.length];
}

function harbourAnchor(data) {
  const spawn = data.mission?.spawn;
  if (spawn) return [spawn.x, spawn.z];
  return data.landmarks?.operaHouse?.centroid || [0, 0];
}

function inHarbour(data, x, z, radius = 820) {
  const [cx, cz] = harbourAnchor(data);
  return Math.hypot(x - cx, z - cz) < radius;
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
  const cols = 28;
  const stacks = 36;
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

function surfaceTexture(file, color) {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${file}`);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildWater(data) {
  const bounds = bboxOf(data.water || []);
  if (!Number.isFinite(bounds.minX)) return new THREE.Mesh();
  bounds.minX -= 24;
  bounds.maxX += 24;
  bounds.minZ -= 24;
  bounds.maxZ += 24;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const step = span > 4000 ? 14 : 8;
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
      const wetCount = wet[at(i, j)] + wet[at(i + 1, j)] + wet[at(i, j + 1)] + wet[at(i + 1, j + 1)];
      if (wetCount < 4) continue;
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
      uQuality: { value: 1 },
      uSun: { value: new THREE.Vector3(-0.55, 0.62, 0.28).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uQuality;
      in float shore;
      out float vShore;
      out vec3 vNormal;
      out vec3 vWorld;
      void main() {
        vec3 p = position;
        float damp = (1.0 - shore * 0.85) * mix(0.45, 1.0, uQuality);
        float swell = sin(p.x * 0.018 + uTime * 0.45) * 0.22
          + sin(p.z * 0.027 - uTime * 0.33) * 0.14
          + sin((p.x * 0.7 + p.z) * 0.05 + uTime * 0.8) * 0.06;
        float chop = sin(p.x * 0.11 + p.z * 0.07 + uTime * 1.15) * 0.025
          + cos(p.z * 0.16 - p.x * 0.05 - uTime * 1.4) * 0.015;
        float w = damp * (swell + chop * uQuality);
        float dwx = damp * (
          cos(p.x * 0.018 + uTime * 0.45) * 0.018 * 0.22
          + cos((p.x * 0.7 + p.z) * 0.05 + uTime * 0.8) * 0.035 * 0.06
          + cos(p.x * 0.11 + p.z * 0.07 + uTime * 1.15) * 0.11 * 0.025 * uQuality
          + sin(p.z * 0.16 - p.x * 0.05 - uTime * 1.4) * 0.05 * 0.015 * uQuality
        );
        float dwz = damp * (
          cos(p.z * 0.027 - uTime * 0.33) * 0.027 * 0.14
          + cos((p.x * 0.7 + p.z) * 0.05 + uTime * 0.8) * 0.05 * 0.06
          + cos(p.x * 0.11 + p.z * 0.07 + uTime * 1.15) * 0.07 * 0.025 * uQuality
          - sin(p.z * 0.16 - p.x * 0.05 - uTime * 1.4) * 0.16 * 0.015 * uQuality
        );
        p.y += w;
        vNormal = normalize(cross(vec3(1.0, dwx, 0.0), vec3(0.0, dwz, 1.0)));
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vShore = shore;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uQuality;
      uniform vec3 uSun;
      in float vShore;
      in vec3 vNormal;
      in vec3 vWorld;
      out vec4 fragColor;
      float ripple(vec2 p) {
        return sin(p.x * 0.62 + uTime * 1.35) * 0.55
          + sin(p.y * 0.71 - uTime * 1.05) * 0.45
          + sin(dot(p, vec2(1.15, 0.62)) + uTime * 1.8) * 0.28;
      }
      void main() {
        vec2 xz = vWorld.xz;
        float e = 0.45;
        float h = ripple(xz);
        float hx = ripple(xz + vec2(e, 0.0)) - h;
        float hz = ripple(xz + vec2(0.0, e)) - h;
        vec3 rippleN = normalize(vec3(-hx / e, 1.0, -hz / e));
        vec3 n = normalize(mix(normalize(vNormal), rippleN, 0.55 * uQuality * (1.0 - vShore * 0.7)));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 sun = normalize(uSun);
        vec3 refl = reflect(-viewDir, n);
        float skyH = clamp(refl.y, -0.05, 1.0);
        vec3 skyTop = vec3(0.36, 0.58, 0.86);
        vec3 skyHor = vec3(0.73, 0.84, 0.88);
        vec3 sky = mix(skyHor, skyTop, smoothstep(0.0, 0.55, skyH));
        float sunDisc = pow(max(dot(refl, sun), 0.0), mix(40.0, 220.0, uQuality));
        float sunSheen = pow(max(dot(refl, sun), 0.0), 8.0);
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.2);
        float depth = smoothstep(0.0, 0.85, vShore);
        vec3 deep = vec3(0.015, 0.11, 0.16);
        vec3 mid = vec3(0.03, 0.28, 0.34);
        vec3 shallow = vec3(0.25, 0.58, 0.52);
        vec3 water = mix(deep, mid, fres * 0.35 + 0.08);
        water = mix(water, shallow, depth);
        float facing = clamp(dot(n, sun) * 0.5 + 0.5, 0.0, 1.0);
        water += facing * vec3(0.02, 0.04, 0.035);
        vec3 col = mix(water, sky, fres * mix(0.35, 0.72, 1.0 - depth));
        col += sunSheen * vec3(0.55, 0.62, 0.58) * 0.18 * (1.0 - depth);
        col += sunDisc * vec3(1.0, 0.96, 0.82) * (1.0 - depth * 0.85);
        float foamBand = smoothstep(0.42, 0.92, vShore);
        float foamMove = 0.65 + 0.35 * sin(vWorld.x * 0.08 + vWorld.z * 0.05 + uTime * 0.8);
        col = mix(col, vec3(0.86, 0.93, 0.90), foamBand * foamMove * 0.55);
        float alpha = mix(0.96, 0.78, depth);
        fragColor = vec4(col, alpha);
      }
    `,
  });
  return new THREE.Mesh(geo, material);
}

function buildBuildings(data) {
  const apartment = pbrMaterial('Facade014_1K-JPG', { roughness: 0.78, metalness: 0.04 });
  const glass = pbrMaterial('Facade001_1K-JPG', { roughness: 0.16, metalness: 0.72, metalnessMap: true });
  const plaster = pbrMaterial('Plaster001_1K-JPG', { roughness: 0.86, metalness: 0.02 });
  const roof = pbrMaterial('RoofingTiles009_1K-JPG', { roughness: 0.7, metalness: 0.02 });
  const batches = { apartment: [], glass: [], plaster: [], roof: [] };
  const group = new THREE.Group();
  const occluders = [];
  function flush(kind, material) {
    if (!batches[kind].length) return;
    const merged = mergeGeometries(batches[kind], false);
    batches[kind].forEach((geo) => geo.dispose());
    batches[kind] = [];
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    occluders.push(mesh);
  }
  for (const building of data.buildings || []) {
    if (!building.polygon || building.polygon.length < 4) continue;
    try {
      const height = Math.max(3, building.height || 8);
      const [cx, cz] = footprintCenter(building.polygon);
      const near = inHarbour(data, cx, cz);
      let kind = 'apartment';
      let tileX = 149;
      let tileY = 294;
      if (height >= 42 || (height >= 26 && ((Math.abs(Math.floor(cx)) + Math.abs(Math.floor(cz))) % 5 === 0))) {
        kind = 'glass';
        tileX = 48;
        tileY = 48;
      } else if (!near && height < 9) {
        kind = 'plaster';
        tileX = 2.6;
        tileY = 2.6;
      }
      const geo = new THREE.ExtrudeGeometry(shapeFromRing(building.polygon), { depth: height, bevelEnabled: false });
      layFlat(geo);
      metreUvs(geo, tileX, tileY);
      batches[kind].push(geo);
      const cap = layFlat(new THREE.ShapeGeometry(shapeFromRing(building.polygon)));
      cap.translate(0, height + 0.08, 0);
      metreUvs(cap, kind === 'glass' ? 6 : 2.4, kind === 'glass' ? 6 : 2.4);
      batches.roof.push(cap);
      if (batches[kind].length >= 80) flush(kind, kind === 'glass' ? glass : kind === 'plaster' ? plaster : apartment);
    } catch {
      // Skip a self-intersecting footprint rather than failing the whole city.
    }
  }
  flush('apartment', apartment);
  flush('glass', glass);
  flush('plaster', plaster);
  flush('roof', roof);
  return { group, occluders };
}

function pbrMaterial(id, { roughness, metalness, metalnessMap = false }) {
  const material = new THREE.MeshStandardMaterial({
    map: surfaceTexture(`${id}_Color.jpg`, true),
    normalMap: surfaceTexture(`${id}_NormalGL.jpg`, false),
    roughnessMap: surfaceTexture(`${id}_Roughness.jpg`, false),
    roughness,
    metalness,
    side: THREE.DoubleSide,
  });
  if (metalnessMap) material.metalnessMap = surfaceTexture(`${id}_Metalness.jpg`, false);
  return material;
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
  const tile = surfaceTexture('Plaster001_1K-JPG_Color.jpg', true);
  const tileNormal = surfaceTexture('Plaster001_1K-JPG_NormalGL.jpg', false);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf4f1ea,
    map: tile,
    normalMap: tileNormal,
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xc5d7df,
    roughness: 0.08,
    metalness: 0.04,
    transmission: 0.55,
    thickness: 0.4,
    transparent: true,
    opacity: 0.78,
  });
  const specs = [
    [-0.34, 0.02, 0.92, 0.78, 0.7],
    [-0.02, -0.04, 1.15, 1.05, 0.86],
    [0.32, 0.05, 0.84, 0.7, 0.66],
    [0.08, 0.28, 0.62, 0.5, 0.5],
  ];
  const unit = Math.min(span, 200);
  const podium = new THREE.Mesh(
    new THREE.BoxGeometry(unit * 0.92, 7.5, unit * 0.42),
    new THREE.MeshStandardMaterial({ color: 0xe7e0d4, roughness: 0.72, metalness: 0.02 }),
  );
  podium.position.y = -4.2;
  const foyer = new THREE.Mesh(new THREE.BoxGeometry(unit * 0.55, 6.2, unit * 0.16), glass);
  foyer.position.set(0, -1.2, unit * 0.12);
  group.add(podium, foyer);
  for (const [x, z, sx, sy, sz] of specs) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x * unit * 0.7, 0, z * unit * 0.26);
    mesh.scale.set(unit * sx * 0.33, unit * sy * 0.3, unit * sz * 0.28);
    mesh.castShadow = true;
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
  const asphalt = pbrMaterial('Asphalt001_1K-JPG', { roughness: 0.92, metalness: 0.04 });
  const steel = pbrMaterial('Metal032_1K-JPG', { roughness: 0.38, metalness: 0.78 });
  const stone = pbrMaterial('Plaster001_1K-JPG', { roughness: 0.82, metalness: 0.03 });
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
  let budget = 220;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const park of data.parks || []) {
    if (budget <= 0) break;
    const box = bboxOf([park.polygon]);
    const near = inHarbour(data, (box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2);
    const tries = near ? 36 : 8;
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
      const crown = new THREE.SphereGeometry(1.15 + rand() * 0.85, 8, 6);
      crown.translate(x, h * 0.58, z);
      leaves.push(crown);
      const crown2 = new THREE.SphereGeometry(0.75 + rand() * 0.45, 7, 5);
      crown2.translate(x + (rand() - 0.5) * 0.8, h * 0.82, z + (rand() - 0.5) * 0.8);
      leaves.push(crown2);
      budget -= 1;
    }
  }
  const group = new THREE.Group();
  if (trunks.length) {
    group.add(new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ color: 0x5c4636, roughness: 0.86 })));
    trunks.forEach((geo) => geo.dispose());
  }
  if (leaves.length) {
    group.add(new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshStandardMaterial({ color: 0x3e6a38, roughness: 0.78 })));
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

function buildLamps(data) {
  const positions = [];
  for (const road of data.roads || []) {
    if (road.points.length < 2 || road.coveredByHarbourDeck) continue;
    const mid = road.points[Math.floor(road.points.length / 2)];
    if (!inHarbour(data, mid[0], mid[1], 640)) continue;
    const samples = frameSamples(road.points, road.width, road.bridge ? road.peak || 0 : 0);
    for (let i = 0; i < samples.length; i += 3) {
      const sample = samples[i];
      for (const side of [1, -1]) {
        const reach = (road.width || 6) / 2 + 0.7;
        positions.push({
          x: sample.x + sample.lx * reach * side,
          y: sample.y,
          z: sample.z + sample.lz * reach * side,
        });
      }
    }
  }
  const kept = positions.slice(0, 160);
  if (!kept.length) return new THREE.Group();
  const pole = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.08, 0.1, 5.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.45, metalness: 0.55 }),
    kept.length,
  );
  const head = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xd7dde2, roughness: 0.35, metalness: 0.4, emissive: 0xfff1d2, emissiveIntensity: 0.18 }),
    kept.length,
  );
  const dummy = new THREE.Object3D();
  kept.forEach((point, index) => {
    dummy.position.set(point.x, point.y + 2.6, point.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pole.setMatrixAt(index, dummy.matrix);
    dummy.position.set(point.x, point.y + 5.25, point.z);
    dummy.updateMatrix();
    head.setMatrixAt(index, dummy.matrix);
  });
  pole.castShadow = true;
  const group = new THREE.Group();
  group.add(pole, head);
  return group;
}

export async function loadHarbourEnvironment(renderer) {
  const hdr = await new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}environment/kloofendal_48d_partly_cloudy_2k.hdr`);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(hdr);
  hdr.dispose();
  pmrem.dispose();
  return target.texture;
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
          vec3 top = vec3(0.36, 0.58, 0.88);
          vec3 mid = vec3(0.55, 0.74, 0.90);
          vec3 horizon = vec3(0.78, 0.86, 0.90);
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
  scene.fog = new THREE.Fog(0xc5d5df, 420, 6400);
  scene.add(new THREE.HemisphereLight(0xd7e6ff, 0x6a624c, 0.28));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.15);
  sun.position.set(-180, 140, 60);
  sun.castShadow = true;
  const lowDetail = typeof location !== 'undefined' && new URLSearchParams(location.search).get('quality') === 'low';
  sun.shadow.mapSize.set(lowDetail ? 1024 : 2048, lowDetail ? 1024 : 2048);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.00035;
  const shadowReach = 110;
  sun.shadow.camera.left = -shadowReach;
  sun.shadow.camera.right = shadowReach;
  sun.shadow.camera.top = shadowReach;
  sun.shadow.camera.bottom = -shadowReach;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9ec4ff, 0.28);
  fill.position.set(160, 60, -90);
  scene.add(fill);

  const bounds = data.bounds;
  const groundWidth = bounds.maxX - bounds.minX + 40;
  const groundDepth = bounds.maxZ - bounds.minZ + 40;
  const groundMap = surfaceTexture('Grass004_1K-JPG_Color.jpg', true);
  groundMap.repeat.set(groundWidth / 6.5, groundDepth / 6.5);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundWidth, groundDepth),
    new THREE.MeshStandardMaterial({ map: groundMap, color: 0xffffff, roughness: 0.94, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const grass = surfaceTexture('Grass004_1K-JPG_Color.jpg', true);
  grass.repeat.set(1, 1);
  const parkMat = new THREE.MeshStandardMaterial({ map: grass, color: 0xffffff, roughness: 0.92 });
  for (const park of data.parks || []) {
    try {
      const mesh = flatMesh(park.polygon, parkMat, 0.04);
      const pos = mesh.geometry.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = pos.getX(i) / 8;
        uv[i * 2 + 1] = pos.getZ(i) / 8;
      }
      mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      mesh.receiveShadow = true;
      scene.add(mesh);
    } catch {
      /* ignore a broken park ring */
    }
  }
  const plazaMat = pbrMaterial('PavingStones092_1K-JPG', { roughness: 0.84, metalness: 0.02 });
  for (const plaza of data.plazas || []) {
    try {
      const plazaMesh = flatMesh(plaza.polygon, plazaMat, 0.06);
      metreUvs(plazaMesh.geometry, 1.8, 1.8);
      plazaMesh.receiveShadow = true;
      scene.add(plazaMesh);
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

  const asphalt = surfaceTexture('Asphalt001_1K-JPG_Color.jpg', true);
  const asphaltNormal = surfaceTexture('Asphalt001_1K-JPG_NormalGL.jpg', false);
  const asphaltRough = surfaceTexture('Asphalt001_1K-JPG_Roughness.jpg', false);
  const roadMat = {
    fast: new THREE.MeshStandardMaterial({ map: asphalt, normalMap: asphaltNormal, roughnessMap: asphaltRough, color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }),
    street: new THREE.MeshStandardMaterial({ map: asphalt, normalMap: asphaltNormal, roughnessMap: asphaltRough, color: 0xffffff, roughness: 0.94, side: THREE.DoubleSide }),
    walk: pbrMaterial('PavingStones092_1K-JPG', { roughness: 0.86, metalness: 0.02 }),
    line: new THREE.MeshStandardMaterial({ color: 0xf4f1c8, roughness: 0.55, side: THREE.DoubleSide }),
  };
  const roadBatches = { fast: [], street: [], walk: [], line: [], kerb: [] };
  roadMat.kerb = pbrMaterial('PavingStones092_1K-JPG', { roughness: 0.84, metalness: 0.02 });
  for (const road of data.roads || []) {
    if (road.coveredByHarbourDeck || road.points.length < 2) continue;
    const peak = road.bridge ? road.peak || 6 : 0;
    const samples = frameSamples(road.points, road.width, peak);
    const yLift = peak ? 0.22 : 0.16;
    const kind = /pedestrian|living_street/.test(road.class) ? 'walk' : /motorway|trunk|primary/.test(road.class) ? 'fast' : 'street';
    const half = (road.width || 6) / 2;
    roadBatches[kind].push(ribbonGeometry(samples, half, yLift, 3.2));
    if (kind === 'fast') roadBatches.line.push(ribbonGeometry(samples, 0.11, yLift + 0.03, 3.2));
    const mid = road.points[Math.floor(road.points.length / 2)];
    if (!lowDetail && kind !== 'walk' && inHarbour(data, mid[0], mid[1])) {
      roadBatches.kerb.push(ribbonGeometry(samples, half + 1.85, 0.05, 1.6));
    }
  }
  for (const kind of Object.keys(roadBatches)) {
    if (!roadBatches[kind].length) continue;
    const merged = mergeGeometries(roadBatches[kind], false);
    roadBatches[kind].forEach((geo) => geo.dispose());
    if (merged) {
      const mesh = new THREE.Mesh(merged, roadMat[kind]);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
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
  if (!lowDetail) scene.add(buildLamps(data));
  const shells = buildShells(data);
  if (shells) scene.add(shells);
  scene.add(buildBridge(data));
  const ferry = buildFerry(data);
  if (ferry) scene.add(ferry);
  for (const district of data.districts || []) {
    const label = textSprite(district.name);
    label.position.set(district.x, 28, district.z);
    scene.add(label);
  }

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

  return { water, occluders: buildings.occluders, markers, sun, sky };
}
