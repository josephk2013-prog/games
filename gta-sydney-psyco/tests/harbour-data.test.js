import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createCollider } from '../src/collider.js';
import { pointInRing, project, ringArea } from '../src/geo.js';
import { isSourcedHarbour } from '../src/validate.js';
import { syntheticHarbour } from '../src/synthetic.js';

const data = JSON.parse(readFileSync(new URL('../public/data/harbour.json', import.meta.url), 'utf8'));

function metresFrom(lon, lat, x, z) {
  const [px, pz] = project(lon, lat, data.origin);
  return Math.hypot(px - x, pz - z);
}

test('bundled chart is sourced OpenStreetMap data, not the synthetic basin', () => {
  assert.equal(isSourcedHarbour(data), true);
  assert.equal(data.synthetic, false);
  assert.match(data.meta.license, /ODbL/);
  assert.match(data.meta.attribution, /OpenStreetMap/);
  assert.match(JSON.stringify(data.meta), /stylized/i);
  assert.equal(data.meta.imagery.includes('No aerial'), true);
});

test('water, Opera House, and Harbour Bridge sit on the real harbour', () => {
  const [wx, wz] = project(151.214, -33.8518, data.origin);
  assert.equal(data.water.some((ring) => pointInRing([wx, wz], ring)), true);
  const [lx, lz] = project(151.2075, -33.8662, data.origin);
  assert.equal(data.water.some((ring) => pointInRing([lx, lz], ring)), false);
  const areas = data.water.map((ring) => Math.abs(ringArea(ring))).sort((a, b) => b - a);
  assert.ok(areas[0] > 1_000_000, 'the harbour polygon should still be a large water body');
  const center = data.landmarks.operaHouse.centroid;
  assert.ok(metresFrom(151.215297, -33.856784, center[0], center[1]) < 80);
  const crest = data.mission.checkpoints.find((cp) => cp.id === 'crest');
  assert.ok(metresFrom(151.2108, -33.8523, crest.x, crest.z) < 80);
  assert.equal(data.bridge.stylizedVertical, true);
  assert.equal(data.landmarks.operaHouse.sourced, true);
});

test('CBD roads and the Harboursville districts are drivable', () => {
  const names = data.roads.map((road) => road.name).filter(Boolean).join(' | ');
  for (const name of ['George Street', 'Alfred Street', 'Bradfield Highway', 'Cahill Expressway']) {
    assert.match(names, new RegExp(name));
  }
  assert.equal(data.meta.city, 'Harboursville');
  const byId = Object.fromEntries(data.mission.checkpoints.map((cp) => [cp.id, cp]));
  for (const id of ['opera', 'milsons', 'north-ryde', 'redfern', 'quay']) assert.ok(byId[id], id);
  assert.ok(byId.redfern.z < byId.opera.z, 'Redfern is south of the Opera House');
  assert.ok(byId['north-ryde'].z > byId.milsons.z, 'North Ryde is north of Milsons Point');
  const redfernLL = data.districts.find((d) => d.id === 'redfern');
  const rydeLL = data.districts.find((d) => d.id === 'north-ryde');
  assert.ok(redfernLL && rydeLL);
  assert.ok(data.buildings.some((building) => building.heightSource === 'osm' && building.height > 100));
  assert.ok(data.buildings.filter((building) => building.heightSource === 'estimated').every((building) => building.height < 40));
  const collider = createCollider(data);
  const spawn = collider.sample(data.mission.spawn.x, data.mission.spawn.z);
  assert.equal(spawn.blocked, false);
  assert.equal(spawn.water, false);
  assert.equal(data.mission.checkpoints.length, 6);
  for (let i = 0; i < data.mission.checkpoints.length; i++) {
    const cp = data.mission.checkpoints[i];
    const sample = collider.sample(cp.x, cp.z);
    assert.equal(sample.out, false, cp.id);
    assert.equal(sample.blocked, false, cp.id);
    if (cp.id !== 'crest') assert.equal(sample.water, false, cp.id);
    for (let j = i + 1; j < data.mission.checkpoints.length; j++) {
      const other = data.mission.checkpoints[j];
      assert.ok(Math.hypot(cp.x - other.x, cp.z - other.z) > 45);
    }
  }
});

test('synthetic fallback is labeled and is not accepted as Sydney', () => {
  const synthetic = syntheticHarbour();
  assert.equal(synthetic.synthetic, true);
  assert.equal(isSourcedHarbour(synthetic), false);
  assert.match(synthetic.meta.attribution, /Not Sydney Harbour/);
  assert.equal(synthetic.meta.source, 'synthetic');
});
