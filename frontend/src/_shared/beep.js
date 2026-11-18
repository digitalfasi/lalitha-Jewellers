// A short beep after a scan: high = OK, low = problem. Silent if audio is blocked.
let ctx;

export function beep(ok = true) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 300;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
  } catch {
    /* no audio: fine */
  }
}
