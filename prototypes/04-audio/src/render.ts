// Renders the tour (tour.ts) through the synth offline in headless Chromium, to a WAV file, and
// prints its levels:  node src/render.ts <out.wav> [options]
//   roll=patter land=plop jump=pop   takes other than the defaults
//   muffle=1200                      the low-pass over everything (Hz)
//   solo=roll                        hear only that voice
//   board                            instead of the tour, every take on every ground, as the soundboard plays them
// Needs Playwright (the cloud sessions have it). A spike's script, not a studio tool: nothing else uses it.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { GROUNDS, TAKES } from "./synth.ts";
import { tour } from "./tour.ts";

const out = process.argv[2] ?? "tour.wav";
const opts = Object.fromEntries(process.argv.slice(3).map((a) => [a.split("=")[0], a.split("=")[1] ?? "1"]));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

/** What to render: the tour's cues frame by frame, or soundboard previews, each in its own leg. */
type Leg = { name: string; at: number };
let cues: unknown[] = [], legs: Leg[] = [], previews: { at: number; voice: string; take: string; ground: string }[] = [], secs: number;
if (opts.board) {
  const LEG = 2.2;
  for (const voice of Object.keys(TAKES) as (keyof typeof TAKES)[])
    for (const take of TAKES[voice])
      for (const ground of GROUNDS) {
        const at = legs.length * LEG;
        legs.push({ name: `${voice} ${take} on ${ground}`, at });
        previews.push({ at, voice, take, ground });
      }
  secs = legs.length * LEG;
} else {
  const t = tour();
  cues = t.cues;
  legs = t.legs.map((l) => ({ name: l.name, at: l.frame / 60 }));
  secs = cues.length / 60;
}

const synth = stripTypeScriptTypes(readFileSync(new URL("./synth.ts", import.meta.url), "utf8")).replace(/^export /gm, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
await page.addScriptTag({ content: `${synth}\nwindow.Synth = Synth;` });
const { b64, renderMs, pulses } = await page.evaluate(async ([cues, previews, legs, secs, opts]: [unknown[], typeof previews, Leg[], number, Record<string, string>]) => {
  const rate = 44100, ctx = new OfflineAudioContext(1, Math.ceil((secs + 1) * rate), rate);
  const synth = new (window as any).Synth(0.6, ctx, Number(opts.muffle) || undefined);
  for (const v of ["roll", "land", "jump"]) if (opts[v]) synth.takes[v] = opts[v];
  if (opts.solo) for (const v of Object.keys(synth.on)) synth.on[v] = v === opts.solo;
  // The roll's pulses at the start of each leg, to count how often it pulses.
  const pulses: number[] = [];
  legs.forEach((leg) => ctx.suspend(leg.at).then(() => { pulses.push(synth.pulses); ctx.resume(); }));
  cues.forEach((c, f) => { if (f) ctx.suspend(f / 60).then(() => { synth.update(c); ctx.resume(); }); });
  if (cues.length) synth.update(cues[0]);
  for (const p of previews) ctx.suspend(p.at + 0.01).then(() => { synth.preview(p.voice, p.take, p.ground); ctx.resume(); });
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  pulses.push(synth.pulses);
  const d = buf.getChannelData(0), n = d.length;
  const wav = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); wav.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt "); wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, rate, true); wav.setUint32(28, rate * 2, true);
  wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); str(36, "data"); wav.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let s = ""; const u = new Uint8Array(wav.buffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return { b64: btoa(s), renderMs, pulses };
}, [cues, previews, legs, secs, opts]);
await browser.close();
const bytes = Buffer.from(b64, "base64");
writeFileSync(out, bytes);
// Levels per leg: peak and loudness (RMS), the share of samples at full scale (clipping), how bright
// it is (the loudness above 1.5 kHz, through four one-pole high-passes so the lows don't leak in),
// which "muffled" lowers, and on the tour, the roll's pulses a second.
const pcm = new Int16Array(bytes.buffer, bytes.byteOffset + 44, (bytes.length - 44) / 2);
const total = pcm.length / 44100;
console.log(`${out}: ${total.toFixed(1)} s, rendered in ${(renderMs / 1000).toFixed(2)} s (${(total / (renderMs / 1000)).toFixed(0)}× real time)`);
legs.forEach((leg, i) => {
  const end = legs[i + 1]?.at ?? secs, a = Math.floor(leg.at * 44100), b = Math.floor(end * 44100);
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
  const rolls = opts.board ? "" : `, roll ${((pulses[i + 1] - pulses[i]) / (end - leg.at)).toFixed(1)}/s`;
  console.log(`${leg.at.toFixed(1).padStart(5)} s  ${leg.name}: peak ${db(peak)} dB, rms ${db(Math.sqrt(sum / (b - a)))} dB, above 1.5 kHz ${db(Math.sqrt(hi / (b - a)))} dB${rolls}${clip ? `, ${clip} samples clipped` : ""}`);
});
