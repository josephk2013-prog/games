function projectX(bounds, x, size, pad) {
  return pad + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (size - pad * 2);
}

function projectY(bounds, z, size, pad) {
  return pad + ((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ)) * (size - pad * 2);
}

function trace(ctx, ring, bounds, size, pad, close = true) {
  if (!ring?.length) return;
  ctx.beginPath();
  ring.forEach((point, index) => {
    const x = projectX(bounds, point[0], size, pad);
    const y = projectY(bounds, point[1], size, pad);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

export function createMinimap(canvas, data) {
  const size = 520;
  const pad = 16;
  const chart = document.createElement('canvas');
  chart.width = size;
  chart.height = size;
  const g = chart.getContext('2d');
  const bounds = data.bounds;

  g.fillStyle = '#d5c7ae';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#1c6f86';
  for (const ring of data.water || []) {
    trace(g, ring, bounds, size, pad);
    g.fill();
  }
  g.fillStyle = '#c6b48a';
  for (const ring of data.islands || []) {
    trace(g, ring, bounds, size, pad);
    g.fill();
  }
  g.fillStyle = '#6f8d4c';
  for (const park of data.parks || []) {
    trace(g, park.polygon, bounds, size, pad);
    g.fill();
  }
  g.fillStyle = '#e6dccb';
  for (const plaza of data.plazas || []) {
    trace(g, plaza.polygon, bounds, size, pad);
    g.fill();
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const road of data.roads || []) {
    g.strokeStyle = road.coveredByHarbourDeck ? '#8d939c' : road.class === 'pedestrian' ? '#8d8376' : '#3c4450';
    g.lineWidth = road.coveredByHarbourDeck ? 4 : Math.max(1.2, (road.width || 6) * 0.22);
    trace(g, road.points, bounds, size, pad, false);
    g.stroke();
  }
  g.fillStyle = 'rgba(55, 58, 64, 0.9)';
  for (const building of data.buildings || []) {
    if (building.kind === 'landmark') continue;
    trace(g, building.polygon, bounds, size, pad);
    g.fill();
  }
  g.fillStyle = '#f4f0e6';
  for (const part of data.landmarks?.operaHouse?.parts || []) {
    trace(g, part, bounds, size, pad);
    g.fill();
  }
  if (data.bridge?.points) {
    g.strokeStyle = '#d5d8de';
    g.lineWidth = 5;
    trace(g, data.bridge.points, bounds, size, pad, false);
    g.stroke();
  }
  g.fillStyle = '#1b2430';
  g.font = '700 28px Trebuchet MS, sans-serif';
  g.fillText('N', size / 2 - 8, 28);

  return {
    draw(vehicle, mission, extras = []) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(chart, 0, 0, w, h);
      const sx = (x) => (projectX(bounds, x, size, pad) / size) * w;
      const sy = (z) => (projectY(bounds, z, size, pad) / size) * h;
      const checkpoints = data.mission?.checkpoints || [];
      checkpoints.forEach((cp, index) => {
        const done = index < mission.index;
        const active = index === mission.index && !mission.complete;
        ctx.beginPath();
        ctx.fillStyle = done ? '#7dcea0' : active ? '#f0c14a' : 'rgba(240,193,74,0.45)';
        ctx.arc(sx(cp.x), sy(cp.z), active ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = '#fff6d8';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
      for (const extra of extras) {
        if (extra.hit) continue;
        ctx.beginPath();
        ctx.fillStyle = '#ff8a3d';
        ctx.arc(sx(extra.x), sy(extra.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const px = sx(vehicle.x);
      const py = sy(vehicle.z);
      const dx = Math.cos(vehicle.heading);
      const dy = -Math.sin(vehicle.heading);
      ctx.fillStyle = '#e24b43';
      ctx.beginPath();
      ctx.moveTo(px + dx * 9, py + dy * 9);
      ctx.lineTo(px - dy * 5 - dx * 6, py + dx * 5 - dy * 6);
      ctx.lineTo(px + dy * 5 - dx * 6, py - dx * 5 - dy * 6);
      ctx.closePath();
      ctx.fill();
    },
  };
}
