// Reading a jewellery weighing scale over USB / serial (Chrome or Edge on a
// computer, Web Serial). Most scales send lines of text like
//   "ST,GS,+  12.345 g"   (ST = stable, US = unstable)   or just "  12.345g"
// We read for a moment and take the latest stable weight in grams.
const PREFS_KEY = "scale.prefs";
export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400];

export function getScalePrefs() {
  try {
    return { baud: 9600, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { baud: 9600 };
  }
}

export function setScalePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {}
}

export const scaleSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

/** Parse one line from the scale. Returns {grams, stable} or null. */
export function parseScaleLine(line) {
  const m = line.match(/([-+]?\s*\d+(?:\.\d+)?)\s*(kg|g|gm|ct)?\b/i);
  if (!m) return null;
  let value = parseFloat(m[1].replace(/\s+/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] || "g").toLowerCase();
  if (unit === "kg") value *= 1000;
  if (unit === "ct") value *= 0.2; // carat -> grams
  const unstable = /\bUS\b|unstable|\?/i.test(line);
  return { grams: Math.round(value * 1000) / 1000, stable: !unstable };
}

/**
 * Read a weight. The first time, the browser asks which device is the scale;
 * after that it remembers it. Resolves to grams (number).
 */
export async function readScale({ timeoutMs = 3000 } = {}) {
  if (!scaleSupported()) throw new Error("Reading the scale works in Chrome or Edge on a computer, with the scale plugged in.");
  const ports = await navigator.serial.getPorts();
  const port = ports[0] || (await navigator.serial.requestPort());
  const { baud } = getScalePrefs();
  await port.open({ baudRate: baud }).catch((e) => {
    if (!String(e?.message).includes("already open")) throw new Error("The scale couldn't be opened. Is another program using it?");
  });
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last = null;
  const stop = setTimeout(() => reader.cancel().catch(() => {}), timeoutMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n|\r/);
      buffer = lines.pop();
      for (const line of lines) {
        const r = parseScaleLine(line);
        if (r && r.grams > 0) {
          last = r;
          if (r.stable && /\bST\b/i.test(line)) {
            reader.cancel().catch(() => {});
          }
        }
      }
    }
  } finally {
    clearTimeout(stop);
    reader.releaseLock();
    await port.close().catch(() => {});
  }
  if (!last) throw new Error("No weight came from the scale. Check the cable and the speed (baud rate) in Settings → This device.");
  if (!last.stable) throw new Error(`The scale wasn't steady (${last.grams} g). Wait for it to settle and try again.`);
  return last.grams;
}
