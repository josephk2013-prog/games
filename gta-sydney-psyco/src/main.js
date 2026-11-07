import './style.css';
import * as THREE from 'three';
import { createActor, stepActor } from './actor.js';
import { attachPlayer, createAvatar, loadCharacter, placeBystander, updateAvatar } from './avatar.js';
import { createAudio } from './audio.js';
import { createCollider } from './collider.js';
import { createCar, updateCar } from './car.js';
import { createMinimap } from './minimap.js';
import { createMission, formatClock } from './mission.js';
import { syntheticHarbour } from './synthetic.js';
import { isSourcedHarbour, sourcedProblems } from './validate.js';
import { createVehicle, resetVehicle, stepVehicle } from './vehicle.js';
import { createProjectile, projectileHits, stepProjectile } from './weapon.js';
import { createVoice } from './voice.js';
import { buildWorld } from './world.js';

const view = document.querySelector('#view');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loading-text');
const title = document.querySelector('#title');
const brief = document.querySelector('#brief');
const fallback = document.querySelector('#fallback');
const startButton = document.querySelector('#start');
const objective = document.querySelector('#objective');
const progress = document.querySelector('#progress');
const clock = document.querySelector('#clock');
const speedReadout = document.querySelector('#speed');
const banner = document.querySelector('#banner');
const complete = document.querySelector('#complete');
const completeTime = document.querySelector('#complete-time');
const againButton = document.querySelector('#again');
const pause = document.querySelector('#pause');
const credit = document.querySelector('#map-credit');
const muteButton = document.querySelector('#mute');
const minimapCanvas = document.querySelector('#minimap');
const creditsBox = document.querySelector('#credits');
const creditsToggle = document.querySelector('#credits-toggle');

const keys = new Set();
const hold = { throttle: false, brake: false, left: false, right: false, hand: false, fire: false };
let playing = false;
let mode = 'drive';
let requestFire = () => {};
let requestToggle = () => {};
let pointerTravel = 0;
let paused = false;
let topDown = false;
let camYaw = 0;
let camPitch = 0.38;
let camDist = 9;
let snapCamera = false;
let titleAngle = 0.4;
let bannerUntil = 0;
const distances = [7, 10, 14, 20];
let distIndex = 1;

const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 25000);
const raycaster = new THREE.Raycaster();
const audio = createAudio();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function showBanner(text) {
  banner.textContent = text;
  banner.hidden = false;
  bannerUntil = performance.now() + 2400;
}

function readInput() {
  let steer = 0;
  if (keys.has('a') || keys.has('arrowleft') || hold.left) steer += 1;
  if (keys.has('d') || keys.has('arrowright') || hold.right) steer -= 1;
  return {
    throttle: keys.has('w') || keys.has('arrowup') || hold.throttle ? 1 : 0,
    brake: keys.has('s') || keys.has('arrowdown') || hold.brake ? 1 : 0,
    steer,
    handbrake: keys.has(' ') || hold.hand,
  };
}

function bindHolds() {
  for (const button of document.querySelectorAll('[data-hold]')) {
    const name = button.dataset.hold;
    const set = (value) => {
      hold[name] = value;
      button.classList.toggle('on', value);
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      set(true);
    });
    button.addEventListener('pointerup', () => set(false));
    button.addEventListener('pointercancel', () => set(false));
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === 'c') {
    distIndex = (distIndex + 1) % distances.length;
    camDist = distances[distIndex];
  }
  if (key === 'v') topDown = !topDown;
  if (key === 'm') {
    const muted = audio.toggleMute();
    muteButton.textContent = muted ? 'Sound off' : 'Sound on';
  }
  if (key === 'escape' && playing) paused = !paused;
  if (key === 'r' && playing) respawn('reset');
  if (key === 'f' && playing) requestToggle();
  if (key === 'j' && playing) requestFire();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  for (const name of Object.keys(hold)) hold[name] = false;
});
window.addEventListener('resize', resize);
view.addEventListener('pointerdown', (event) => {
  if (event.target !== view) return;
  view.setPointerCapture(event.pointerId);
  view.dataset.drag = '1';
  pointerTravel = 0;
  view.dataset.x = String(event.clientX);
  view.dataset.y = String(event.clientY);
});
view.addEventListener('pointermove', (event) => {
  if (view.dataset.drag !== '1') return;
  const x = Number(view.dataset.x);
  const y = Number(view.dataset.y);
  pointerTravel += Math.hypot(event.clientX - x, event.clientY - y);
  camYaw -= (event.clientX - x) * 0.005;
  camPitch = Math.max(0.12, Math.min(1.15, camPitch - (event.clientY - y) * 0.0035));
  view.dataset.x = String(event.clientX);
  view.dataset.y = String(event.clientY);
});
window.addEventListener('pointerup', () => {
  const wasDrag = view.dataset.drag === '1';
  view.dataset.drag = '0';
  if (wasDrag && pointerTravel < 8 && playing && mode === 'foot') requestFire();
});

async function loadHarbour() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('synthetic') === '1') {
    return { data: syntheticHarbour(), fallback: true, reason: 'synthetic preview requested' };
  }
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/harbour.json`);
    if (!response.ok) throw new Error(`map request failed (${response.status})`);
    const data = await response.json();
    if (!isSourcedHarbour(data)) throw new Error(sourcedProblems(data).join('; '));
    return { data, fallback: false, reason: '' };
  } catch (error) {
    return { data: syntheticHarbour(), fallback: true, reason: error.message || 'map data failed to load' };
  }
}

let respawn = () => {};

async function boot() {
  resize();
  bindHolds();
  loading.hidden = false;
  loadingText.textContent = 'Loading the harbour chart…';
  const loaded = await loadHarbour();
  const data = loaded.data;
  loadingText.textContent = 'Building collision…';
  const collider = createCollider(data);
  const world = await buildWorld(scene, data, (text) => {
    loadingText.textContent = text;
  });
  if (new URLSearchParams(window.location.search).get('water') === 'low' && world.water.material?.uniforms?.uQuality) {
    world.water.material.uniforms.uQuality.value = 0.25;
  }
  const car = createCar();
  car.group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  const avatar = createAvatar();
  const voice = createVoice(import.meta.env.BASE_URL);
  const subtitle = document.querySelector('#subtitle');
  let pose = 'idle';
  let poseUntil = 0;
  let jumpSpoken = false;
  attachPlayer(avatar, `${import.meta.env.BASE_URL}characters/sean-oshea.glb`).then(() => {
    if (avatar.missingRig) showBanner('Sean O\'Shea mesh loaded without a usable generated rig.');
  }).catch((error) => {
    showBanner(`Sean O'Shea did not load. ${error.message || error}`);
  });
  loadCharacter(`${import.meta.env.BASE_URL}characters/cesium-man.glb`).then((gltf) => {
    const spawn = data.mission.spawn;
    const heading = spawn.heading || 0;
    const side = heading + Math.PI / 2;
    const bystander = placeBystander(
      gltf,
      spawn.x + Math.cos(heading) * 0.6 + Math.cos(side) * 3.4,
      spawn.z + Math.sin(heading) * 0.6 + Math.sin(side) * 3.4,
    );
    scene.add(bystander.group);
    avatar.bystander = bystander;
  }).catch(() => {});
  scene.add(car.group, car.shadow, avatar.group);
  const vehicle = createVehicle(data.mission.spawn);
  const actor = createActor(data.mission.spawn);
  const shotGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const shotMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  const shots = [];
  let fireCooldown = 0;
  const buoyGeo = new THREE.SphereGeometry(0.55, 12, 10);
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x7a3a10, emissiveIntensity: 0.4, roughness: 0.4 });
  const buoys = [];
  for (let i = 0; i < 5; i++) {
    const angle = (data.mission.spawn.heading || 0) + (i - 2) * 0.42;
    const distance = 16 + i * 7;
    const buoy = {
      x: data.mission.spawn.x + Math.cos(angle) * distance,
      z: data.mission.spawn.z + Math.sin(angle) * distance,
      y: 1.3,
      hit: false,
    };
    const mesh = new THREE.Mesh(buoyGeo, buoyMat);
    mesh.position.set(buoy.x, buoy.y, buoy.z);
    scene.add(mesh);
    buoys.push({ ...buoy, mesh });
  }
  const buoyReadout = document.querySelector('#buoys');
  const modeLabel = document.querySelector('#mode-label');
  const mission = createMission(data.mission.checkpoints);
  const minimap = createMinimap(minimapCanvas, data);
  brief.textContent = data.mission.brief;
  credit.textContent = data.meta?.attribution || '';
  if (loaded.fallback || data.synthetic) {
    fallback.hidden = false;
    fallback.textContent = `Synthetic demo map — not Sydney Harbour. ${loaded.reason || 'Sourced chart unavailable.'}`;
  }

  for (const marker of world.markers) {
    const cp = data.mission.checkpoints[marker.index];
    const sample = collider.sample(cp.x, cp.z);
    marker.group.position.y = (sample.height || 0) + 1.7;
  }

  function pointForReset() {
    if (mission.index <= 0) return data.mission.spawn;
    return data.mission.checkpoints[mission.index - 1];
  }

  respawn = (reason) => {
    const point = pointForReset();
    resetVehicle(vehicle, point);
    actor.x = point.x;
    actor.z = point.z;
    actor.heading = point.heading || 0;
    actor.speed = 0;
    actor.vy = 0;
    actor.height = point.height || 0;
    actor.grounded = true;
    actor.wet = 0;
    mode = 'drive';
    const notes = {
      water: 'Harbour water. Back on the road.',
      fall: 'Left the deck. Reset.',
      out: 'Left the map. Reset.',
      reset: 'Vehicle reset.',
    };
    showBanner(notes[reason] || 'Vehicle reset.');
  };

  document.querySelector('#reset-btn').addEventListener('click', () => {
    if (playing) respawn('reset');
  });
  muteButton.addEventListener('click', () => {
    audio.resume();
    const muted = audio.toggleMute();
    voice.setMuted(muted);
    muteButton.textContent = muted ? 'Sound off' : 'Sound on';
  });
  document.querySelector('#talk-btn').addEventListener('click', () => {
    voice.resume().then(() => voice.say('hello', subtitle));
  });
  document.querySelector('#voice-volume').addEventListener('input', (event) => {
    voice.setVolume(Number(event.target.value));
  });
  creditsToggle.addEventListener('click', () => {
    creditsBox.hidden = !creditsBox.hidden;
  });

  function begin() {
    audio.resume();
    playing = true;
    paused = false;
    title.hidden = true;
    complete.hidden = true;
    mission.index = 0;
    mission.complete = false;
    mission.startedAt = performance.now();
    mission.finishedAt = 0;
    const viewId = new URLSearchParams(window.location.search).get('view');
    const viewed = data.mission.checkpoints.find((cp) => cp.id === viewId);
    const start = viewed || data.mission.spawn;
    resetVehicle(vehicle, start);
    actor.x = start.x;
    actor.z = start.z;
    actor.heading = start.heading || 0;
    actor.height = start.height || 0;
    actor.vy = 0;
    actor.speed = 0;
    mode = 'drive';
    for (const buoy of buoys) {
      buoy.hit = false;
      buoy.mesh.visible = true;
    }
    showBanner(viewed ? `Placed at ${viewed.name}. This is a start point, not a drive you just made.` : data.mission.checkpoints[0].name);
    snapCamera = true;
    voice.resume().then(() => voice.say('hello', subtitle));
  }

  function bodyNow() {
    return mode === 'foot' ? actor : vehicle;
  }

  requestToggle = () => {
    if (!playing || paused) return;
    if (mode === 'drive') {
      if (Math.abs(vehicle.speed) > 4) {
        showBanner('Slow the coupe to step out');
        return;
      }
      mode = 'foot';
      const side = vehicle.heading + Math.PI / 2;
      actor.x = vehicle.x + Math.cos(side) * 2.3;
      actor.z = vehicle.z + Math.sin(side) * 2.3;
      actor.heading = vehicle.heading;
      actor.height = vehicle.height;
      actor.vy = 0;
      actor.speed = 0;
      actor.grounded = true;
      showBanner('On foot. J fires. F returns to the coupe.');
      pose = 'idle';
      voice.say('foot', subtitle);
      return;
    }
    const distance = Math.hypot(actor.x - vehicle.x, actor.z - vehicle.z);
    if (distance > 4.5) {
      showBanner('Walk back to the coupe');
      return;
    }
    mode = 'drive';
    pose = 'enter';
    poseUntil = performance.now() + 1100;
    showBanner('Driving');
    voice.say('car', subtitle);
  };

  requestFire = () => {
    if (!playing || paused || fireCooldown > 0) return;
    fireCooldown = 0.2;
    const body = bodyNow();
    const muzzle = 0.9;
    const shot = createProjectile(
      {
        x: body.x + Math.cos(body.heading) * muzzle,
        y: body.height + (mode === 'foot' ? 1.25 : 0.9),
        z: body.z + Math.sin(body.heading) * muzzle,
        vy: 4,
      },
      body.heading,
    );
    const mesh = new THREE.Mesh(shotGeo, shotMat);
    scene.add(mesh);
    shots.push({ shot, mesh });
    audio.blip(390);
  };
  document.querySelector('#fire-btn').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestFire();
  });
  document.querySelector('#exit-btn').addEventListener('click', () => requestToggle());

  const hud = document.querySelector('#hud');
  startButton.addEventListener('click', () => {
    hud.hidden = false;
    begin();
  });
  againButton.addEventListener('click', begin);
  loading.hidden = true;
  title.hidden = false;

  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing && !paused && !mission.complete) {
      const input = readInput();
      const result = mode === 'foot'
        ? stepActor(actor, { ...input, jump: keys.has(' ') || hold.hand }, dt, collider.sample)
        : stepVehicle(vehicle, input, dt, collider.sample);
      if (result.event) respawn(result.event);
      const focusHit = bodyNow();
      const hit = mission.hit(focusHit.x, focusHit.z, now);
      if (hit) {
        audio.blip(mission.complete ? 880 : 640);
        if (mission.complete) {
          mission.finishedAt = now;
          complete.hidden = false;
          completeTime.textContent = formatClock(now - mission.startedAt);
          showBanner('Harboursville run complete');
        } else showBanner(mission.objective());
      }
    }
    if (playing && !paused && (hold.fire || keys.has('j'))) requestFire();
    fireCooldown = Math.max(0, fireCooldown - dt);
    for (let i = shots.length - 1; i >= 0; i--) {
      const entry = shots[i];
      const alive = stepProjectile(entry.shot, dt);
      entry.mesh.position.set(entry.shot.x, entry.shot.y, entry.shot.z);
      let struck = false;
      if (alive) {
        for (const buoy of buoys) {
          if (buoy.hit) continue;
          if (projectileHits(entry.shot, buoy, 1.15)) {
            buoy.hit = true;
            buoy.mesh.visible = false;
            struck = true;
            const popped = buoys.filter((item) => item.hit).length;
            showBanner(popped === buoys.length ? 'All buoys popped' : `Buoy ${popped} / ${buoys.length}`);
            audio.blip(720);
          }
        }
      }
      if (!alive || struck) {
        entry.mesh.removeFromParent();
        shots.splice(i, 1);
      }
    }
    updateCar(car, vehicle, dt);
    const moving = Math.abs(actor.speed) > 0.4;
    const clip = !actor.grounded ? 'jump' : poseUntil > now ? pose : moving ? (Math.abs(actor.speed) > 4.2 ? 'run' : 'walk') : 'idle';
    if (playing && mode === 'foot' && !actor.grounded && !jumpSpoken) {
      jumpSpoken = true;
      voice.say('jump', subtitle);
    }
    if (actor.grounded) jumpSpoken = false;
    updateAvatar(avatar, actor, playing && avatar.ready && (mode === 'foot' || poseUntil > now), dt, clip);
    if (avatar.bystander) avatar.bystander.mixer.update(dt);
    if (world.sun) {
      const lit = playing ? bodyNow() : { x: data.landmarks.operaHouse.centroid[0], z: data.landmarks.operaHouse.centroid[1], height: 0 };
      world.sun.target.position.set(lit.x, lit.height || 0, lit.z);
      world.sun.position.set(lit.x - 70, (lit.height || 0) + 110, lit.z + 36);
      world.sun.target.updateMatrixWorld();
    }
    if (world.sky) world.sky.position.copy(camera.position);
    audio.setSpeed(playing && !paused && mode === 'drive' ? vehicle.speed : 0);
    world.water.material.uniforms.uTime.value = now * 0.001;

    for (const marker of world.markers) {
      const done = marker.index < mission.index;
      const active = marker.index === mission.index && !mission.complete;
      marker.group.visible = playing && !mission.complete;
      marker.group.rotation.y += dt * (active ? 1.3 : 0.4);
      const pulse = active ? 1 + Math.sin(now * 0.006) * 0.08 : done ? 0.45 : 0.72;
      marker.group.scale.setScalar(pulse);
      marker.mat.color.setHex(done ? 0x8fe3b0 : 0xf0c14a);
      marker.mat.emissive.setHex(done ? 0x1d6b42 : active ? 0xd4891a : 0x6a5018);
    }

    if (!playing) {
      titleAngle += dt * 0.08;
      const focus = data.landmarks.operaHouse.centroid;
      camera.up.set(0, 1, 0);
      camera.position.set(focus[0] + Math.cos(titleAngle) * 240, 78, focus[1] + Math.sin(titleAngle) * 180);
      camera.lookAt(focus[0], 18, focus[1]);
    } else if (topDown) {
      const focus = bodyNow();
      camera.up.set(0, 0, 1);
      camera.position.set(focus.x, 260, focus.z + 0.1);
      camera.lookAt(focus.x, 0, focus.z);
    } else {
      const entering = mode === 'drive' && poseUntil > now;
      const focus = entering ? actor : bodyNow();
      camera.up.set(0, 1, 0);
      const onFootCam = mode === 'foot' || entering;
      const followDist = onFootCam ? 5.6 : camDist;
      const ahead = onFootCam ? 1.35 : 6;
      look.set(
        focus.x + Math.cos(focus.heading) * ahead,
        focus.height + (onFootCam ? 1.35 : 1.6),
        focus.z + Math.sin(focus.heading) * ahead,
      );
      const back = focus.heading + Math.PI + camYaw;
      const horiz = Math.cos(camPitch) * followDist;
      desired.set(look.x + Math.cos(back) * horiz, look.y + Math.sin(camPitch) * followDist, look.z + Math.sin(back) * horiz);
      if (world.occluders.length) {
        const direction = desired.clone().sub(look);
        const distance = direction.length();
        if (distance > 0.001) {
          direction.multiplyScalar(1 / distance);
          raycaster.set(look, direction);
          raycaster.far = distance;
          raycaster.near = 0.4;
          const hits = raycaster.intersectObjects(world.occluders, false);
          if (hits[0] && hits[0].distance < distance) {
            const pull = Math.max(2.4, hits[0].distance - 0.7);
            desired.copy(look).addScaledVector(direction, pull);
          }
        }
      }
      const blend = 1 - Math.exp(-dt * 4.2);
      if (snapCamera) camera.position.copy(desired);
      else camera.position.lerp(desired, blend);
      snapCamera = false;
      camera.lookAt(look);
    }

    const total = data.mission.checkpoints.length;
    const shown = mission.complete ? total : mission.index + 1;
    objective.textContent = mission.objective();
    progress.textContent = `${Math.min(shown, total)} / ${total}`;
    clock.textContent = formatClock(mission.startedAt ? (mission.finishedAt || now) - mission.startedAt : 0);
    const focus = bodyNow();
    speedReadout.textContent = String(Math.round(Math.abs(mode === 'foot' ? actor.speed : vehicle.speed) * 3.6));
    if (modeLabel) modeLabel.textContent = mode === 'foot' ? 'On foot' : 'Driving';
    if (buoyReadout) buoyReadout.textContent = `${buoys.filter((item) => item.hit).length} / ${buoys.length}`;
    pause.hidden = !paused;
    if (bannerUntil && now > bannerUntil) banner.hidden = true;
    minimap.draw(focus, mission, buoys);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((error) => {
  loading.hidden = false;
  loadingText.textContent = `The harbour could not start. ${error.message || error}`;
  console.error(error);
});
