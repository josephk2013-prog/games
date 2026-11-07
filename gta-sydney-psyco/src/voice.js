const LINES = {
  hello: "Sean O'Shea. Harboursville quay.",
  car: 'Back in the coupe.',
  foot: 'On foot.',
  jump: 'Up.',
};

export function createVoice(baseUrl) {
  let ctx = null;
  let buffers = {};
  let muted = false;
  let volume = 0.7;
  let ready = false;
  let usingStockVoice = false;

  async function ensure() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    for (const id of Object.keys(LINES)) {
      try {
        const response = await fetch(`${baseUrl}characters/sean-${id}.wav`);
        if (!response.ok) throw new Error(String(response.status));
        buffers[id] = await ctx.decodeAudioData(await response.arrayBuffer());
      } catch {
        buffers[id] = null;
      }
    }
    ready = true;
  }

  function stock(id) {
    usingStockVoice = true;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utter = new SpeechSynthesisUtterance(LINES[id]);
    utter.volume = muted ? 0 : volume;
    utter.rate = 0.92;
    utter.pitch = 0.7;
    synth.cancel();
    synth.speak(utter);
  }

  return {
    lines: LINES,
    async resume() {
      await ensure();
      if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => {});
    },
    say(id, subtitle) {
      if (subtitle) {
        subtitle.hidden = false;
        subtitle.textContent = usingStockVoice ? `${LINES[id]} (browser stock voice)` : LINES[id];
      }
      if (muted) return;
      const buffer = buffers[id];
      if (ctx && buffer) {
        usingStockVoice = false;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        if (subtitle) subtitle.textContent = LINES[id];
        return;
      }
      stock(id);
    },
    setMuted(value) {
      muted = value;
      if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
    },
    setVolume(value) {
      volume = value;
    },
    get usingStockVoice() {
      return usingStockVoice;
    },
    get ready() {
      return ready;
    },
  };
}
