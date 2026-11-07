import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chainLines,
  clipPolygon,
  pointInRing,
  project,
  ringArea,
  simplify,
  unproject,
} from '../src/geo.js';

test('project and unproject round-trip near Sydney Harbour', () => {
  const origin = { lon: 151.2115, lat: -33.8555 };
  const lon = 151.215297;
  const lat = -33.856784;
  const [x, z] = project(lon, lat, origin);
  const back = unproject(x, z, origin);
  assert.ok(Math.abs(back.lon - lon) < 1e-9);
  assert.ok(Math.abs(back.lat - lat) < 1e-9);
  assert.ok(x > 0);
  assert.ok(z < 0);
});

test('point in ring and signed area', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInRing([5, 5], square), true);
  assert.equal(pointInRing([15, 5], square), false);
  assert.ok(ringArea(square) > 0);
});

test('clip polygon keeps the inside of the box', () => {
  const triangle = [[-10, -10], [10, -10], [0, 20]];
  const clipped = clipPolygon(triangle, { minX: -5, maxX: 5, minZ: -5, maxZ: 5 });
  assert.ok(clipped.length >= 3);
  for (const point of clipped) {
    assert.ok(point[0] >= -5.001 && point[0] <= 5.001);
    assert.ok(point[1] >= -5.001 && point[1] <= 5.001);
  }
});

test('simplify keeps endpoints and chainLines closes a loop', () => {
  const line = [[0, 0], [1, 0.01], [2, -0.01], [10, 0]];
  const simple = simplify(line, 0.5);
  assert.deepEqual(simple[0], [0, 0]);
  assert.deepEqual(simple.at(-1), [10, 0]);
  assert.ok(simple.length < line.length);
  const chained = chainLines([
    [[0, 0], [5, 0]],
    [[5, 0], [5, 5]],
    [[5, 5], [0, 5]],
    [[0, 5], [0, 0]],
  ]);
  assert.equal(chained.rings.length, 1);
  assert.equal(chained.chains.length, 0);
});
