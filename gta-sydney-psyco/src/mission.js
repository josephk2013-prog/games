export function createMission(checkpoints) {
  return {
    index: 0,
    complete: false,
    startedAt: 0,
    finishedAt: 0,
    lastHit: null,
    hit(x, z, now = 0) {
      if (this.complete) return null;
      const cp = checkpoints[this.index];
      if (!cp) return null;
      const radius = cp.radius ?? 24;
      if (Math.hypot(x - cp.x, z - cp.z) > radius) return null;
      this.lastHit = cp;
      this.index += 1;
      if (this.index >= checkpoints.length) {
        this.complete = true;
        this.finishedAt = now;
      }
      return cp;
    },
    objective() {
      if (this.complete) return 'Harbour loop complete';
      const cp = checkpoints[this.index];
      return cp ? cp.name : 'Harbour loop';
    },
  };
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
