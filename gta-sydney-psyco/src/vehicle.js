import { clamp } from './geo.js';

const MAX_SPEED = 30;
const ACCEL = 16;
const BRAKE = 24;
const REVERSE = 8;
const STEER = 1.85;

export function createVehicle(spawn) {
  return {
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading || 0,
    speed: 0,
    steer: 0,
    wet: 0,
    height: spawn.height || 0,
    vy: 0,
    airborne: false,
  };
}

export function resetVehicle(vehicle, point) {
  vehicle.x = point.x;
  vehicle.z = point.z;
  vehicle.heading = point.heading || 0;
  vehicle.speed = 0;
  vehicle.steer = 0;
  vehicle.wet = 0;
  vehicle.height = point.height || 0;
  vehicle.vy = 0;
  vehicle.airborne = false;
}

/**
 * Arcade step. `sample(x, z)` returns
 * `{ blocked, water, fall, out, height, grip }`.
 * Heading 0 faces +x (east); positive heading turns toward +z (north).
 */
export function stepVehicle(vehicle, input, dt, sample) {
  dt = clamp(dt, 0, 0.05);
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  vehicle.steer = steer;

  const here = sample(vehicle.x, vehicle.z);
  if (here.out) return { event: 'out' };
  if (here.fall) vehicle.airborne = true;

  const inTheWater = here.water && !vehicle.airborne && vehicle.height < 1.5;
  if (inTheWater) {
    vehicle.wet += dt;
    vehicle.speed *= Math.max(0, 1 - dt * 3);
    if (vehicle.wet > 0.55) return { event: 'water' };
  } else if (!here.water) {
    vehicle.wet = 0;
  }

  const grip = here.grip ?? 1;
  if (brake > 0 && throttle === 0 && vehicle.speed <= 0.6) {
    vehicle.speed -= REVERSE * brake * dt;
  } else {
    vehicle.speed += throttle * ACCEL * dt;
    if (brake > 0) vehicle.speed -= Math.sign(vehicle.speed || 1) * BRAKE * brake * dt;
  }

  if (throttle === 0 && brake === 0) {
    const drag = vehicle.speed * vehicle.speed * 0.012 + 1.6;
    if (vehicle.speed > 0) vehicle.speed = Math.max(0, vehicle.speed - drag * dt);
    else vehicle.speed = Math.min(0, vehicle.speed + drag * dt);
  }

  if (input.handbrake) vehicle.speed *= Math.max(0, 1 - dt * 3.1);
  vehicle.speed = clamp(vehicle.speed, -REVERSE, MAX_SPEED * grip);

  if (Math.abs(vehicle.speed) > 0.35) {
    const speedFactor = clamp(Math.abs(vehicle.speed) / 10, 0.4, 1);
    const slow = 1 / (1 + Math.abs(vehicle.speed) * 0.028);
    const dir = Math.sign(vehicle.speed);
    const hand = input.handbrake ? 1.55 : 1;
    vehicle.heading += steer * STEER * speedFactor * slow * dir * hand * dt;
  }

  const dx = Math.cos(vehicle.heading) * vehicle.speed * dt;
  const dz = Math.sin(vehicle.heading) * vehicle.speed * dt;
  const nx = vehicle.x + dx;
  const nz = vehicle.z + dz;
  const nose = 2.15;
  const half = 0.85;
  const fx = Math.cos(vehicle.heading);
  const fz = Math.sin(vehicle.heading);
  const rx = -fz;
  const rz = fx;
  const probes = [
    [nx, nz],
    [nx + fx * nose + rx * half, nz + fz * nose + rz * half],
    [nx + fx * nose - rx * half, nz + fz * nose - rz * half],
  ];

  let blocked = false;
  let water = false;
  let fall = false;
  let out = false;
  for (const [px, pz] of probes) {
    const hit = sample(px, pz);
    if (hit.blocked) blocked = true;
    if (hit.water) water = true;
    if (hit.fall) fall = true;
    if (hit.out) out = true;
  }
  if (out) return { event: 'out' };
  if (fall) vehicle.airborne = true;

  if (blocked) {
    const tryX = sample(nx, vehicle.z);
    const tryZ = sample(vehicle.x, nz);
    if (!tryX.blocked && !tryX.fall && !tryX.out) vehicle.x = nx;
    else if (!tryZ.blocked && !tryZ.fall && !tryZ.out) vehicle.z = nz;
    vehicle.speed *= 0.42;
  } else {
    vehicle.x = nx;
    vehicle.z = nz;
  }

  if (water && !vehicle.airborne && vehicle.height < 1.5) {
    vehicle.wet += dt;
    if (vehicle.wet > 0.55) return { event: 'water' };
  }

  const landed = sample(vehicle.x, vehicle.z);
  const groundY = landed.height || 0;
  if (vehicle.airborne || landed.fall) {
    vehicle.airborne = true;
    vehicle.vy -= 28 * dt;
    vehicle.height += vehicle.vy * dt;
    if (!landed.fall && vehicle.height <= groundY) {
      vehicle.height = groundY;
      vehicle.vy = 0;
      vehicle.airborne = false;
    } else if (vehicle.height < groundY - 12) {
      return { event: landed.water ? 'water' : 'fall' };
    }
  } else {
    vehicle.height = groundY;
    vehicle.vy = 0;
  }
  return { event: null };
}
