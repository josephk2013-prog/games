/** Original pellet sidearm. Not a Grand-V or Rockstar weapon. */

export function createProjectile(origin, heading, speed = 46) {
  return {
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: Math.cos(heading) * speed,
    vy: origin.vy ?? 3,
    vz: Math.sin(heading) * speed,
    life: 1.8,
  };
}

export function stepProjectile(shot, dt) {
  const step = Math.max(0, Math.min(dt, 0.05));
  shot.vy -= 14 * step;
  shot.x += shot.vx * step;
  shot.y += shot.vy * step;
  shot.z += shot.vz * step;
  shot.life -= step;
  return shot.life > 0 && shot.y > -6;
}

export function projectileHits(shot, target, radius) {
  const dx = shot.x - target.x;
  const dy = shot.y - (target.y ?? 1);
  const dz = shot.z - target.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}
