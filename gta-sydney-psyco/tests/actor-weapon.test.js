import assert from 'node:assert/strict';
import test from 'node:test';
import { createActor, stepActor } from '../src/actor.js';
import { createVehicle, stepVehicle } from '../src/vehicle.js';
import { createProjectile, projectileHits, stepProjectile } from '../src/weapon.js';

const flat = () => ({ blocked: false, water: false, fall: false, out: false, height: 0, grip: 1 });

test('on-foot avatar walks, jumps, and lands under gravity', () => {
  const actor = createActor({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < 30; i++) stepActor(actor, { throttle: 1, brake: 0, steer: 0, jump: false }, 1 / 60, flat);
  assert.ok(actor.x > 1);
  stepActor(actor, { throttle: 0, brake: 0, steer: 0, jump: true }, 1 / 60, flat);
  assert.ok(actor.height > 0.05);
  assert.equal(actor.grounded, false);
  for (let i = 0; i < 90; i++) stepActor(actor, { throttle: 0, brake: 0, steer: 0, jump: false }, 1 / 60, flat);
  assert.ok(actor.height < 0.05);
  assert.equal(actor.grounded, true);
});

test('pellets arc downward and can hit a buoy', () => {
  const shot = createProjectile({ x: 0, y: 2, z: 0, vy: 0 }, 0, 20);
  const startY = shot.y;
  for (let i = 0; i < 10; i++) stepProjectile(shot, 0.04);
  assert.ok(shot.y < startY);
  assert.ok(shot.x > 5);
  const buoy = { x: shot.x, y: shot.y, z: shot.z };
  assert.equal(projectileHits(shot, buoy, 0.5), true);
  assert.equal(projectileHits(shot, { x: 80, y: 2, z: 80 }, 1), false);
});

test('a car that leaves the deck falls instead of snapping to the roadway', () => {
  const vehicle = createVehicle({ x: 0, z: 0, heading: 0, height: 30 });
  const edge = () => ({ blocked: false, water: true, fall: true, out: false, height: 0, grip: 1 });
  const first = stepVehicle(vehicle, { throttle: 0, brake: 0, steer: 0, handbrake: false }, 1 / 60, edge);
  assert.equal(first.event, null);
  assert.equal(vehicle.airborne, true);
  assert.ok(vehicle.height < 30);
  let event = null;
  for (let i = 0; i < 120 && !event; i++) {
    event = stepVehicle(vehicle, { throttle: 0, brake: 0, steer: 0, handbrake: false }, 1 / 60, edge).event;
  }
  assert.equal(event, 'water');
});
