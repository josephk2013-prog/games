import * as THREE from 'three';

export function createAvatar() {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x1f6f86, roughness: 0.72 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b394, roughness: 0.62 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.55, metalness: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 4, 8), cloth);
  body.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skin);
  head.position.y = 1.68;
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), dark);
  barrel.position.set(0.22, 0, 0);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.07), dark);
  grip.position.set(0.06, -0.1, 0);
  gun.add(barrel, grip);
  gun.position.set(0.12, 1.12, 0.28);
  group.add(body, head, gun);
  group.visible = false;
  return { group, gun };
}

export function updateAvatar(avatar, actor, visible) {
  avatar.group.visible = visible;
  if (!visible) return;
  const bob = Math.abs(actor.speed) > 0.45 ? Math.sin(Date.now() * 0.014) * 0.05 : 0;
  avatar.group.position.set(actor.x, actor.height + bob, actor.z);
  avatar.group.rotation.y = -actor.heading;
}
