import { clamp } from './geo.js';

const GRAVITY = 28;
const WALK = 6.4;

export function createActor(spawn) {
  return {
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading || 0,
    speed: 0,
    vy: 0,
    height: spawn.height || 0,
    grounded: true,
    wet: 0,
  };
}

/** On-foot body. Space/jump is ignored by the car, which uses that key as a handbrake. */
export function stepActor(actor, input, dt, sample) {
  dt = clamp(dt, 0, 0.05);
  const forward = clamp(input.throttle || 0, 0, 1) - clamp(input.brake || 0, 0, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const target = forward * WALK;
  actor.speed += (target - actor.speed) * Math.min(1, dt * 10);
  if (Math.abs(actor.speed) > 0.25) actor.heading += steer * 2.6 * dt * Math.sign(actor.speed);
  else if (steer) actor.heading += steer * 2.2 * dt;

  const nx = actor.x + Math.cos(actor.heading) * actor.speed * dt;
  const nz = actor.z + Math.sin(actor.heading) * actor.speed * dt;
  const ahead = sample(nx, nz);
  if (ahead.out) return { event: 'out' };
  if (!ahead.blocked) {
    actor.x = nx;
    actor.z = nz;
  } else {
    const tryX = sample(nx, actor.z);
    const tryZ = sample(actor.x, nz);
    if (!tryX.blocked && !tryX.out) actor.x = nx;
    else if (!tryZ.blocked && !tryZ.out) actor.z = nz;
    actor.speed *= 0.4;
  }

  const ground = sample(actor.x, actor.z);
  const groundY = ground.height || 0;
  if (ground.water && groundY < 0.5) {
    actor.wet += dt;
    if (actor.wet > 0.45) return { event: 'water' };
  } else actor.wet = 0;

  if (input.jump && actor.grounded) {
    actor.vy = 7.6;
    actor.grounded = false;
  }
  actor.vy -= GRAVITY * dt;
  actor.height += actor.vy * dt;
  if (actor.height <= groundY) {
    actor.height = groundY;
    actor.vy = 0;
    actor.grounded = true;
  } else actor.grounded = false;
  if (actor.height < -8) return { event: 'fall' };
  return { event: null };
}
