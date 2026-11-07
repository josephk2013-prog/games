import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export function createAvatar() {
  const group = new THREE.Group();
  group.visible = false;
  return {
    group,
    bones: {},
    ready: false,
    missingRig: false,
    clip: 'idle',
    time: 0,
  };
}

export async function loadCharacter(url) {
  return loader.loadAsync(url);
}

export async function attachPlayer(avatar, url) {
  const gltf = await loadCharacter(url);
  let skinned = null;
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.frustumCulled = false;
      obj.material = new THREE.MeshPhysicalMaterial({
        color: 0x6a6e74,
        roughness: 0.58,
        metalness: 0.04,
        sheen: 0.45,
        sheenColor: new THREE.Color(0xc8ccd2),
        sheenRoughness: 0.62,
        side: THREE.DoubleSide,
      });
    }
    if (obj.isSkinnedMesh) skinned = obj;
  });
  if (!skinned || !skinned.skeleton) {
    avatar.missingRig = true;
    return avatar;
  }
  skinned.skeleton.bones.forEach((bone) => {
    avatar.bones[bone.name] = bone;
  });
  const required = ['hips', 'spine', 'head', 'armL', 'armR', 'legL', 'legR'];
  avatar.missingRig = required.some((name) => !avatar.bones[name]);
  avatar.group.add(gltf.scene);
  avatar.ready = !avatar.missingRig;
  return avatar;
}

function swing(bone, x, z = 0) {
  if (!bone) return;
  bone.rotation.x = x;
  bone.rotation.z = z;
}

export function updateAvatar(avatar, actor, visible, dt = 0, clip = 'idle') {
  avatar.group.visible = Boolean(visible && avatar.ready);
  if (!avatar.ready) return;
  avatar.time += dt;
  avatar.clip = clip;
  const t = avatar.time;
  const moving = Math.abs(actor.speed) > 0.4;
  const run = Math.abs(actor.speed) > 4.2;
  const freq = run ? 10 : 6.2;
  const amp = run ? 0.85 : 0.5;
  const step = Math.sin(t * freq);
  for (const bone of Object.values(avatar.bones)) {
    bone.rotation.set(0, 0, 0);
  }
  if (clip === 'jump' || !actor.grounded) {
    swing(avatar.bones.legL, -0.55);
    swing(avatar.bones.legR, -0.35);
    swing(avatar.bones.armL, -0.8);
    swing(avatar.bones.armR, -0.8);
    if (avatar.bones.hips) avatar.bones.hips.rotation.x = 0.15;
  } else if (clip === 'enter') {
    swing(avatar.bones.legL, -1.15);
    swing(avatar.bones.legR, -1.15);
    swing(avatar.bones.armL, -0.4);
    swing(avatar.bones.armR, 0.2);
    if (avatar.bones.spine) avatar.bones.spine.rotation.x = 0.45;
    if (avatar.bones.hips) avatar.bones.hips.position.y = 0.72;
  } else if (moving) {
    swing(avatar.bones.legL, step * amp);
    swing(avatar.bones.legR, -step * amp);
    swing(avatar.bones.armL, -step * amp * 0.75);
    swing(avatar.bones.armR, step * amp * 0.75);
    if (avatar.bones.spine) avatar.bones.spine.rotation.y = step * 0.08;
  } else {
    const idle = Math.sin(t * 1.6) * 0.04;
    if (avatar.bones.spine) avatar.bones.spine.rotation.x = idle;
    swing(avatar.bones.armL, 0.08 + idle);
    swing(avatar.bones.armR, 0.08 - idle);
  }
  if (avatar.bones.hips && clip !== 'enter') avatar.bones.hips.position.y = 0.98;
  avatar.group.position.set(actor.x, actor.height, actor.z);
  // The converted mesh faces +Z. Heading 0 moves toward +X, so yaw is a quarter turn ahead of -heading.
  avatar.group.rotation.y = Math.PI / 2 - actor.heading;
}

export function placeBystander(gltf, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(1.15);
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.frustumCulled = false;
    }
  });
  group.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  if (gltf.animations.length) mixer.clipAction(gltf.animations[0]).play();
  return { group, mixer };
}
