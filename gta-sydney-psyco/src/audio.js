export function createAudio() {
  let ctx = null;
  let engine = null;
  let gain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    try {
      ctx = new AudioCtx();
      gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 280;
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 58;
      engine.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      engine.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  return {
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setSpeed(speed) {
      if (!ctx || muted || !engine || !gain) return;
      const amount = Math.abs(speed);
      engine.frequency.setTargetAtTime(52 + amount * 4.2, ctx.currentTime, 0.05);
      const volume = amount > 0.5 ? Math.min(0.07, 0.02 + amount * 0.0014) : 0;
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
    },
    blip(freq = 660) {
      if (!ensure() || muted) return;
      const osc = ctx.createOscillator();
      const note = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      note.gain.setValueAtTime(0.0001, ctx.currentTime);
      note.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      note.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(note);
      note.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    },
    toggleMute() {
      muted = !muted;
      if (gain && muted) gain.gain.value = 0;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
