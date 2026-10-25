// Renders the tour (tour.ts) through the synth offline in headless Chromium, to a WAV file,
// and prints its levels:  node src/render.ts <out.wav> [voice, to hear only that one]
// Needs Playwright (the cloud sessions have it). A spike's script, not a studio tool: nothing else uses it.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { tour } from "./tour.ts";

const out = process.argv[2] ?? "tour.wav", solo = process.argv[3] ?? "";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const { cues, legs } = tour();
const synth = stripTypeScriptTypes(readFileSync(new URL("./synth.ts", import.meta.url), "utf8")).replace(/^export /gm, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
await page.addScriptTag({ content: `${synth}\nwindow.Synth = Synth;` });
const b64: string = await page.evaluate(async ([cues, solo]: [unknown[], string]) => {
  const rate = 44100, ctx = new OfflineAudioContext(1, Math.ceil((cues.length / 60 + 1) * rate), rate);
  const synth = new (window as any).Synth(0.6, ctx);
  if (solo) for (const v of Object.keys(synth.on)) synth.on[v] = v === solo;
  cues.forEach((c, f) => { if (f) ctx.suspend(f / 60).then(() => { synth.update(c); ctx.resume(); }); });
  synth.update(cues[0]);
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  (window as any).renderMs = performance.now() - t0;
  const d = buf.getChannelData(0), n = d.length;
  const wav = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); wav.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt "); wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, rate, true); wav.setUint32(28, rate * 2, true);
  wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); str(36, "data"); wav.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let s = ""; const u = new Uint8Array(wav.buffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}, [cues, solo]);
const renderMs: number = await page.evaluate(() => (window as any).renderMs);
await browser.close();
const bytes = Buffer.from(b64, "base64");
writeFileSync(out, bytes);
// Levels per leg: peak and loudness (RMS), the share of samples at full scale (clipping), and how
// bright it is: the loudness above 1.5 kHz (four one-pole high-passes, so the lows don't leak in), which "muffled" lowers.
const pcm = new Int16Array(bytes.buffer, bytes.byteOffset + 44, (bytes.length - 44) / 2);
const secs = pcm.length / 44100;
console.log(`${out}: ${secs.toFixed(1)} s, rendered in ${(renderMs / 1000).toFixed(2)} s (${(secs / (renderMs / 1000)).toFixed(0)}× real time)`);
legs.forEach((leg, i) => {
  const a = Math.floor((leg.frame / 60) * 44100), b = Math.floor(((legs[i + 1]?.frame ?? cues.length) / 60) * 44100);
  let peak = 0, sum = 0, clip = 0, hi = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 1500) / 44100), lp = [0, 0, 0, 0];
  for (let j = a; j < b; j++) {
    const s = pcm[j] / 32767, v = Math.abs(s);
    peak = Math.max(peak, v); sum += v * v; if (v > 0.99) clip++;
    let h = s;
    for (let n = 0; n < 4; n++) { lp[n] += (h - lp[n]) * k; h -= lp[n]; }
    hi += h * h;
  }
  const db = (v: number) => (20 * Math.log10(Math.max(v, 1e-6))).toFixed(1);
  console.log(`${((leg.frame / 60)).toFixed(1).padStart(5)} s  ${leg.name}: peak ${db(peak)} dB, rms ${db(Math.sqrt(sum / (b - a)))} dB, above 1.5 kHz ${db(Math.sqrt(hi / (b - a)))} dB${clip ? `, ${clip} samples clipped` : ""}`);
});
