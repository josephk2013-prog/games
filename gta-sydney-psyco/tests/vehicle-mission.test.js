import assert from 'node:assert/strict';
import test from 'node:test';
import { bridgeHeight, createCollider } from '../src/collider.js';
import { createMission, formatClock } from '../src/mission.js';
import { createVehicle, stepVehicle } from '../src/vehicle.js';

const open = () => ({ blocked: false, water: false, fall: false, out: false, height: 0, grip: 1 });

test('vehicle accelerates east and turns left toward north', () => {
  const vehicle = createVehicle({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < 90; i++) stepVehicle(vehicle, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, open);
  assert.ok(vehicle.x > 5, `expected eastward motion, x=${vehicle.x}`);
  assert.ok(Math.abs(vehicle.z) < 1);
  const turning = createVehicle({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < 120; i++) stepVehicle(turning, { throttle: 1, brake: 0, steer: 1, handbrake: false }, 1 / 60, open);
  assert.ok(turning.heading > 0.2);
  assert.ok(turning.z > 0.5);
});

test('vehicle stops against a wall and reports water', () => {
  const vehicle = createVehicle({ x: 0, z: 0, heading: 0 });
  const wall = (x) => ({ blocked: x > 4, water: false, fall: false, out: false, height: 0, grip: 1 });
  for (let i = 0; i < 180; i++) stepVehicle(vehicle, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, wall);
  assert.ok(vehicle.x < 5.2, `car drove through the wall to x=${vehicle.x}`);

  const wetCar = createVehicle({ x: 0, z: 0, heading: 0 });
  const events = [];
  const wet = () => ({ blocked: false, water: true, fall: false, out: false, height: 0, grip: 0.2 });
  for (let i = 0; i < 80; i++) events.push(stepVehicle(wetCar, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, wet).event);
  assert.ok(events.includes('water'));
});

test('mission completes checkpoints in order', () => {
  const checkpoints = [
    { id: 'a', name: 'First', x: 0, z: 0, radius: 5 },
    { id: 'b', name: 'Second', x: 30, z: 0, radius: 5 },
  ];
  const mission = createMission(checkpoints);
  assert.equal(mission.hit(100, 100), null);
  assert.equal(mission.hit(1, 1).id, 'a');
  assert.equal(mission.hit(1, 1), null);
  assert.equal(mission.complete, false);
  assert.equal(mission.hit(30, 1).id, 'b');
  assert.equal(mission.complete, true);
  assert.equal(mission.objective(), 'Harbour loop complete');
  assert.equal(formatClock(125000), '2:05');
});

test('bridge deck meets the ground at both ends and peaks in the middle', () => {
  assert.ok(Math.abs(bridgeHeight(0, 30)) < 1e-9);
  assert.ok(Math.abs(bridgeHeight(1, 30)) < 1e-9);
  assert.ok(Math.abs(bridgeHeight(0.5, 30) - 30) < 1e-9);
});

test('collider blocks building footprints, treats the deck as dry, and flags harbour water', () => {
  const data = {
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    water: [[[-200, -40], [200, -40], [200, 40], [-200, 40]]],
    islands: [],
    buildings: [{ polygon: [[10, 80], [30, 80], [30, 100], [10, 100]] }],
    roads: [
      { points: [[-50, 80], [80, 80]], width: 8, bridge: false, coveredByHarbourDeck: false, peak: 0 },
    ],
    elevations: [{ points: [[-80, 0], [80, 0]], width: 30, peak: 30, kind: 'harbour' }],
  };
  const collider = createCollider(data);
  assert.equal(collider.sample(20, 90).blocked, true);
  assert.equal(collider.sample(0, 0).bridge, true);
  assert.equal(collider.sample(0, 0).water, false);
  assert.ok(collider.sample(0, 0).height > 20);
  assert.equal(collider.sample(0, 30).water, true);
  assert.equal(collider.inWater(0, 90), false);
});
