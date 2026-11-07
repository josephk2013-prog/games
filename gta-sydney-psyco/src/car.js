import * as THREE from 'three';

export function createCar() {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xb4232a,
    roughness: 0.28,
    metalness: 0.18,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.55, metalness: 0.22 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb7dbe6,
    roughness: 0.05,
    metalness: 0.04,
    transmission: 0.45,
    thickness: 0.2,
    transparent: true,
    opacity: 0.72,
  });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffe2a8, emissiveIntensity: 1.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xaa1515, emissiveIntensity: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.46, 1.78), paint);
  body.position.set(0.05, 0.72, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 1.62), paint);
  nose.position.set(1.95, 0.62, 0);
  nose.rotation.z = -0.18;
  const tailDeck = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 1.68), paint);
  tailDeck.position.set(-1.75, 0.78, 0);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 1.84), dark);
  skirt.position.set(0, 0.42, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.42, 1.52), glass);
  cabin.position.set(-0.22, 1.18, 0);
  cabin.rotation.z = 0.08;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 1.42), dark);
  roof.position.set(-0.38, 1.42, 0);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 1.55), paint);
  hood.position.set(1.05, 0.98, 0);
  hood.rotation.z = -0.06;
  group.add(body, nose, tailDeck, skirt, cabin, roof, hood);
  for (const z of [-0.78, 0.78]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 14, Math.PI), dark);
    arch.position.set(1.15, 0.48, z);
    arch.rotation.y = Math.PI / 2;
    group.add(arch);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  const steerWheels = [];
  const mounts = [
    { x: 1.38, z: 0.86, steer: true },
    { x: 1.38, z: -0.86, steer: true },
    { x: -1.32, z: 0.86, steer: false },
    { x: -1.32, z: -0.86, steer: false },
  ];
  for (const mount of mounts) {
    const pivot = new THREE.Group();
    pivot.position.set(mount.x, 0.38, mount.z);
    const mesh = new THREE.Mesh(wheelGeo, dark);
    pivot.add(mesh);
    group.add(pivot);
    wheels.push(mesh);
    if (mount.steer) steerWheels.push(pivot);
  }

  for (const z of [-0.58, 0.58]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.28), lamp);
    light.position.set(2.28, 0.68, z);
    group.add(light);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.32), tail);
    rear.position.set(-2.18, 0.78, z);
    group.add(rear);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.7), dark);
  grille.position.set(2.32, 0.58, 0);
  group.add(grille);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.24),
    new THREE.MeshBasicMaterial({ map: plateTexture(), transparent: true }),
  );
  plate.position.set(-2.19, 0.72, 0);
  plate.rotation.y = -Math.PI / 2;
  group.add(plate);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.08;

  return { group, wheels, steerWheels, shadow, spin: 0 };
}

function plateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4f1e4';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#1d2430';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#1d2430';
  g.font = '700 48px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('SYD 01', 128, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function updateCar(car, vehicle, dt) {
  car.group.position.set(vehicle.x, vehicle.height, vehicle.z);
  car.group.rotation.y = -vehicle.heading;
  car.spin += vehicle.speed * dt * 2.4;
  for (const wheel of car.wheels) wheel.rotation.z = car.spin;
  for (const pivot of car.steerWheels) pivot.rotation.y = -vehicle.steer * 0.35;
  car.shadow.position.set(vehicle.x, vehicle.height + 0.07, vehicle.z);
}
