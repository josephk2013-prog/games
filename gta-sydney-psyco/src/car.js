import * as THREE from 'three';

export function createCar() {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xc7372f, roughness: 0.4, metalness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.62, metalness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xb7e4ef,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.72,
  });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffd48a, emissiveIntensity: 1 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.72, 1.86), paint);
  body.position.set(0, 0.78, 0);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.28, 1.9), dark);
  skirt.position.set(0, 0.46, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.58, 1.62), glass);
  cabin.position.set(-0.28, 1.32, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.5), dark);
  roof.position.set(-0.32, 1.64, 0);
  group.add(body, skirt, cabin, roof);

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

  for (const z of [-0.62, 0.62]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lamp);
    light.position.set(2.12, 0.78, z);
    group.add(light);
  }
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
