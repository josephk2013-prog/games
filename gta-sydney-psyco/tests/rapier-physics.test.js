import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createVehicle } from '../src/vehicle.js';
import { createHarbourPhysics } from '../src/physics.js';

const flat = () => ({ blocked: false, water: false, fall: false, out: false, height: 0, grip: 1 });

await RAPIER.init();

test('Rapier WASM loads and the raycast car drives, turns, and stops for a wall', async () => {
  const open = createHarbourPhysics(RAPIER, flat);
  const vehicle = createVehicle({ x: 0, z: 0, heading: 0, height: 0 });
  open.attach(vehicle);
  for (let i = 0; i < 150; i++) open.step(vehicle, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, true);
  assert.ok(vehicle.x > 6, `expected the chassis to drive east, x=${vehicle.x}`);
  assert.ok(Math.abs(vehicle.speed) > 4, `expected forward speed, speed=${vehicle.speed}`);
  assert.equal(open.engine, 'rapier');
  assert.equal(open.walkers.length, 4);

  const turning = createVehicle({ x: 0, z: 0, heading: 0, height: 0 });
  open.attach(turning);
  for (let i = 0; i < 160; i++) open.step(turning, { throttle: 1, brake: 0, steer: 1, handbrake: false }, 1 / 60, true);
  assert.ok(turning.z > 1, `left steer should carry the car north, z=${turning.z}`);

  const wall = createHarbourPhysics(RAPIER, (x) => ({
    blocked: x > 4,
    water: false,
    fall: false,
    out: false,
    height: 0,
    grip: 1,
  }));
  const blocked = createVehicle({ x: 0, z: 0, heading: 0, height: 0 });
  wall.attach(blocked);
  for (let i = 0; i < 180; i++) wall.step(blocked, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, true);
  assert.ok(blocked.x < 6.5, `the car drove through the Rapier wall to x=${blocked.x}`);
});

test('Rapier characters walk and a shot ray marks one down', async () => {
  const physics = createHarbourPhysics(RAPIER, flat);
  const vehicle = createVehicle({ x: 0, z: 0, heading: 0, height: 0 });
  physics.attach(vehicle);
  const start = physics.walkers.map((walker) => [walker.x, walker.z]);
  for (let i = 0; i < 40; i++) physics.step(vehicle, { throttle: 0, brake: 1, steer: 0, handbrake: false }, 1 / 60, false);
  const moved = physics.walkers.some((walker, index) => Math.hypot(walker.x - start[index][0], walker.z - start[index][1]) > 0.15);
  assert.equal(moved, true);
  const target = physics.walkers[0];
  const hit = physics.castSegment(target.x - 3, 0.9, target.z, target.x + 0.4, 0.9, target.z);
  assert.ok(hit?.walker, 'the ray should meet a pedestrian collider');
  hit.walker.down = true;
  assert.equal(target.down, true);
});

test('a raised harbour sample lifts the Rapier ground', async () => {
  const physics = createHarbourPhysics(RAPIER, (x) => ({
    blocked: false,
    water: false,
    fall: false,
    out: false,
    height: Math.max(0, x) * 0.08,
    grip: 1,
  }));
  const vehicle = createVehicle({ x: 0, z: 0, heading: 0, height: 0 });
  physics.attach(vehicle);
  for (let i = 0; i < 160; i++) physics.step(vehicle, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, true);
  assert.ok(vehicle.x > 4, `car never reached the rise, x=${vehicle.x}`);
  assert.ok(vehicle.height > 0.25, `car did not climb the sampled rise, height=${vehicle.height}`);
});
