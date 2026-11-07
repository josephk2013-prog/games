/**
 * Rapier 0.21 vehicle, character, and raycast world.
 * This is the Dimforge physics engine compiled to WebAssembly.
 * It is not a GTA game port and it does not load any Rockstar data.
 *
 * Upstream: https://github.com/dimforge/rapier
 * Package: @dimforge/rapier3d-compat@0.21.0 (Apache-2.0, unmodified)
 */

const PATCH = 72;
const SEGMENTS = 24;
const REBUILD_AT = 18;

export async function loadRapier() {
  const module = await import('@dimforge/rapier3d-compat');
  const RAPIER = module.default;
  await RAPIER.init();
  return RAPIER;
}

function yawFromRotation(rotation) {
  const { x, y, z, w } = rotation;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

function rotationFromHeading(heading) {
  const yaw = -heading;
  const half = yaw * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export function createHarbourPhysics(RAPIER, sample) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const down = new RAPIER.Vector3(0, -1, 0);
  const axle = new RAPIER.Vector3(0, 0, 1);
  const mounts = [
    [1.3, 0.78],
    [1.3, -0.78],
    [-1.25, 0.78],
    [-1.25, -0.78],
  ];

  let chassis = null;
  let vehicle = null;
  let groundBody = null;
  let blockBodies = [];
  let patchX = null;
  let patchZ = null;
  const walkers = [];
  const walkerByHandle = new Map();

  function surface(hit) {
    if (!hit || hit.out || hit.fall) return -25;
    return hit.height || 0;
  }

  function clearPatch() {
    if (groundBody) world.removeRigidBody(groundBody);
    for (const body of blockBodies) world.removeRigidBody(body);
    groundBody = null;
    blockBodies = [];
  }

  function rebuild(cx, cz) {
    clearPatch();
    const points = SEGMENTS + 1;
    const heights = new Float32Array(points * points);
    for (let col = 0; col < points; col++) {
      for (let row = 0; row < points; row++) {
        const x = cx + (col / SEGMENTS - 0.5) * PATCH;
        const z = cz + (row / SEGMENTS - 0.5) * PATCH;
        heights[col * points + row] = surface(sample(x, z));
      }
    }
    groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0, cz));
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(SEGMENTS, SEGMENTS, heights, new RAPIER.Vector3(PATCH, 1, PATCH), 0).setFriction(0.95),
      groundBody,
    );
    const seen = [];
    for (let x = cx - PATCH / 2; x <= cx + PATCH / 2; x += 4) {
      for (let z = cz - PATCH / 2; z <= cz + PATCH / 2; z += 4) {
        const hit = sample(x, z);
        if (!hit?.blocked) continue;
        if (chassis) {
          const at = chassis.translation();
          if (Math.hypot(x - at.x, z - at.z) < 3.2) continue;
        }
        if (seen.some((point) => Math.hypot(point.x - x, point.z - z) < 3.5)) continue;
        seen.push({ x, z });
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 6, z));
        world.createCollider(RAPIER.ColliderDesc.cuboid(2.1, 6, 2.1).setFriction(0.8), body);
        blockBodies.push(body);
      }
    }
    patchX = cx;
    patchZ = cz;
  }

  function ensurePatch(x, z) {
    if (patchX == null || Math.hypot(x - patchX, z - patchZ) > REBUILD_AT) rebuild(x, z);
  }

  function makeChassis(pose) {
    const height = pose.height || 0;
    chassis = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, height + 0.95, pose.z)
        .setRotation(rotationFromHeading(pose.heading || 0))
        .setCanSleep(false)
        .setAdditionalMass(1100)
        .setLinearDamping(0.08)
        .setAngularDamping(1.4),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(2.05, 0.3, 0.9).setDensity(0).setFriction(0.6), chassis);
    vehicle = world.createVehicleController(chassis);
    vehicle.indexUpAxis = 1;
    vehicle.setIndexForwardAxis = 0;
    for (const [x, z] of mounts) {
      vehicle.addWheel(new RAPIER.Vector3(x, -0.05, z), down, axle, 0.32, 0.36);
    }
    for (let i = 0; i < vehicle.numWheels(); i++) {
      vehicle.setWheelSuspensionStiffness(i, 60);
      vehicle.setWheelSuspensionCompression(i, 2.4);
      vehicle.setWheelSuspensionRelaxation(i, 3.2);
      vehicle.setWheelFrictionSlip(i, 4);
      vehicle.setWheelSideFrictionStiffness(i, 0.6);
      vehicle.setWheelMaxSuspensionTravel(i, 0.28);
    }
  }

  const walkerSpots = [
    [7, 3.2],
    [9, -3.4],
    [-4, 4.2],
    [5, 6],
  ];

  function walkerPose(pose, spot, id) {
    const heading = pose.heading || 0;
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    const rx = -fz;
    const rz = fx;
    let x = pose.x + fx * spot[0] + rx * spot[1];
    let z = pose.z + fz * spot[0] + rz * spot[1];
    const here = sample(x, z);
    if (!here || here.blocked || here.water || here.out) {
      x = pose.x + fx * (6 + id);
      z = pose.z + fz * (6 + id);
    }
    const ground = sample(x, z);
    const y = ground && !ground.out ? ground.height || 0 : 0;
    return { x, y, z, heading: heading + (id - 1.5) * 0.4 };
  }

  function placeWalkers(pose) {
    if (walkers.length === walkerSpots.length) {
      walkers.forEach((walker, id) => {
        const next = walkerPose(pose, walkerSpots[id], id);
        walker.x = next.x;
        walker.y = next.y;
        walker.z = next.z;
        walker.heading = next.heading;
        walker.down = false;
        walker.body.setTranslation({ x: next.x, y: next.y + 0.86, z: next.z }, true);
      });
      return;
    }
    walkerSpots.forEach((spot, id) => {
      const next = walkerPose(pose, spot, id);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(next.x, next.y + 0.86, next.z));
      const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.28), body);
      const controller = world.createCharacterController(0.04);
      controller.enableSnapToGround(0.45);
      controller.enableAutostep(0.35, 0.15, true);
      const walker = {
        id,
        x: next.x,
        z: next.z,
        y: next.y,
        heading: next.heading,
        down: false,
        body,
        collider,
        controller,
        color: [0x2f5d50, 0x243e73, 0x8a4b2f, 0x5c3d6e][id],
      };
      walkers.push(walker);
      walkerByHandle.set(collider.handle, walker);
    });
  }

  function readChassis(state) {
    const translation = chassis.translation();
    const rotation = chassis.rotation();
    const yaw = yawFromRotation(rotation);
    state.x = translation.x;
    state.z = translation.z;
    state.height = translation.y - 0.72;
    state.heading = -yaw;
    state.speed = vehicle.currentVehicleSpeed();
    state.airborne = [0, 1, 2, 3].every((wheel) => !vehicle.wheelIsInContact(wheel));
  }

  function stepWalkers(dt) {
    for (const walker of walkers) {
      if (walker.down) continue;
      const desired = {
        x: Math.cos(walker.heading) * 1.45 * dt,
        y: -0.4,
        z: Math.sin(walker.heading) * 1.45 * dt,
      };
      walker.controller.computeColliderMovement(walker.collider, desired);
      const moved = walker.controller.computedMovement();
      const next = walker.body.translation();
      const x = next.x + moved.x;
      const z = next.z + moved.z;
      const groundHit = sample(x, z);
      const groundY = groundHit && !groundHit.out ? groundHit.height || 0 : 0;
      const y = Math.min(groundY + 1.05, Math.max(groundY + 0.8, next.y + moved.y));
      walker.body.setNextKinematicTranslation({ x, y, z });
      walker.x = x;
      walker.y = groundY;
      walker.z = z;
      const travelled = Math.hypot(moved.x, moved.z);
      if (travelled < 1.45 * dt * 0.35) walker.heading += Math.PI / 2;
    }
  }

  function knockWalkers(state) {
    if (Math.abs(state.speed) < 4) return null;
    for (const walker of walkers) {
      if (walker.down) continue;
      if (Math.hypot(walker.x - state.x, walker.z - state.z) < 2.35) {
        walker.down = true;
        return walker;
      }
    }
    return null;
  }

  return {
    ready: true,
    engine: 'rapier',
    version: '0.21.0',
    walkers,
    attach(pose) {
      if (chassis) world.removeRigidBody(chassis);
      chassis = null;
      vehicle = null;
      makeChassis(pose);
      rebuild(pose.x, pose.z);
      placeWalkers(pose);
      world.step();
    },
    reset(pose) {
      this.attach(pose);
    },
    step(state, input, dt, driving) {
      dt = Math.max(0.001, Math.min(dt, 0.05));
      world.timestep = dt;
      ensurePatch(state.x, state.z);
      const throttle = Math.max(0, Math.min(1, input.throttle || 0));
      const brake = Math.max(0, Math.min(1, input.brake || 0));
      const steer = Math.max(-1, Math.min(1, input.steer || 0));
      state.steer = steer;
      let force = 0;
      let brakeForce = 2;
      if (driving && throttle > 0 && brake === 0) force = 4200 * throttle;
      else if (driving && brake > 0 && throttle === 0 && Math.abs(state.speed) < 1.4) force = -1800 * brake;
      if (driving && brake > 0 && force >= 0) brakeForce = 36 * brake;
      if (!driving) brakeForce = 80;
      if (driving && input.handbrake) brakeForce = Math.max(brakeForce, 70);
      const wheelSteer = driving ? -steer * 0.46 : 0;
      for (let i = 0; i < vehicle.numWheels(); i++) {
        vehicle.setWheelEngineForce(i, force);
        vehicle.setWheelBrake(i, brakeForce);
        vehicle.setWheelSteering(i, i < 2 ? wheelSteer : 0);
      }
      vehicle.updateVehicle(dt);
      stepWalkers(dt);
      world.step();
      readChassis(state);
      const bumped = knockWalkers(state);
      const here = sample(state.x, state.z);
      if (here?.out) return { event: 'out', bumped };
      if (here?.water && state.height < 1.5 && !state.airborne) {
        state.wet = (state.wet || 0) + dt;
        if (state.wet > 0.55) return { event: 'water', bumped };
      } else if (!here?.water) state.wet = 0;
      if (state.height < -8) return { event: here?.water ? 'water' : 'fall', bumped };
      return { event: null, bumped };
    },
    castSegment(x0, y0, z0, x1, y1, z1) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      const length = Math.hypot(dx, dy, dz);
      if (length < 0.02) return null;
      const ray = new RAPIER.Ray({ x: x0, y: y0, z: z0 }, { x: dx / length, y: dy / length, z: dz / length });
      const hit = world.castRay(ray, length, true, undefined, undefined, undefined, chassis);
      if (!hit) return null;
      const walker = walkerByHandle.get(hit.collider.handle);
      if (walker) return { walker, solid: false };
      return { walker: null, solid: true };
    },
  };
}
