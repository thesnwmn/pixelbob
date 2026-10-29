// Renders a kept run of green-1-hills offline in headless Chromium: the music, Bob's voices
// (the audio spike's), and both together, each timed against real time and measured (peak and
// loudness, and the music's loudness where Bob's squelches live, 200 to 600 Hz). Writes the mix
// to a WAV.  node src/render.ts <out.wav> [replay id, default green-1-hills-run]
// Needs Playwright (the cloud sessions have it) and starts this folder's Vite dev server.
// A spike's script, not a studio tool: nothing else uses it.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Listener } from "../../04-audio/src/listen.ts";
import { Play } from "../../../game/src/play.ts";
import { parseReplayFile } from "../../../game/src/replay.ts";
import { parseScenario } from "../../../game/src/scenario.ts";
import { loadLevels } from "../../../game/scripts/load-levels.ts";
import { Follower } from "./follow.ts";
import { Conductor } from "./score.ts";

const out = process.argv[2] ?? "run.wav";
const id = process.argv[3] ?? "green-1-hills-run";
const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
loadLevels();
const { file } = parseReplayFile(id, read(`../../../game/replays/${id}.json`));
const { scenario } = parseScenario(file!.replay.scenario, read(`../../../game/scenarios/${file!.replay.scenario}.json`));

// The run, frame by frame: the mood, Bob's cues, and the notes, as the page would have them.
const play = new Play(scenario!);
const follower = new Follower(play.level.world, play.start().x, play.level.finish.x0);
const ear = new Listener();
ear.reset(play.bob);
const conductor = new Conductor(scenario!.seed);
const frames = file!.replay.frames.map((f, i) => {
  play.step(f);
  const mood = { ...follower.follow(play.bob, 1 / 60) };
  const cues = { ...ear.hear(play.bob, play.level.world) };
  return { mood, cues, notes: conductor.advance(mood, (i + 1) / 60 + 0.12, []) };
});
type Frames = typeof frames;
type Measured = { realtime: number; peak: string; rms: string; mid: string; wav: number[][] | null };
const secs = frames.length / 60 + 3;

const dir = fileURLToPath(new URL("..", import.meta.url));
const vite = spawn("npx", ["vite", "--port", "5187", "--strictPort"], { cwd: dir, stdio: "ignore" });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
try {
  const page = await browser.newPage();
  for (let i = 0; ; i++) {
    try { await page.goto("http://localhost:5187/src/style.css"); break; } catch { if (i > 40) throw new Error("no Vite"); await new Promise((r) => setTimeout(r, 250)); }
  }
  const audio = fileURLToPath(new URL("../../04-audio/src/synth.ts", import.meta.url));
  const result: Record<"music" | "bob" | "both", Measured> = await page.evaluate(async ({ frames, secs, audio }: { frames: Frames; secs: number; audio: string }) => {
    // Vite's dev server serves the TypeScript: this folder's from /src, the audio spike's by its path.
    const { Band } = (await import(String("/src/band.ts"))) as typeof import("./band.ts");
    const { Synth } = (await import(`/@fs${audio}`)) as typeof import("../../04-audio/src/synth.ts");
    const rate = 44100;
    async function render(music: boolean, bob: boolean) {
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
      const band = music ? new Band(0.3, ctx) : null, synth = bob ? new Synth(0.6, ctx) : null;
      frames.forEach((f, i) => {
        ctx.suspend(i / 60).then(() => {
          if (synth) synth.update(f.cues);
          if (band) {
            const c = f.cues, hit = Math.max(c.impact / 200, c.jump ? 0.4 + 0.6 * c.jump : 0, c.splash / 150);
            if (hit > 0.15 && synth) band.duck(hit);
            band.follow(f.mood);
            for (const n of f.notes) band.play(n);
          }
          ctx.resume();
        });
      });
      const t0 = performance.now();
      const buf = await ctx.startRendering();
      const ms = performance.now() - t0;
      // Loudness overall and in Bob's squelch band, by a crude band-pass (two one-poles).
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      let peak = 0, sum = 0, mid = 0, lo = 0, lo2 = 0;
      const a1 = Math.exp(-2 * Math.PI * 600 / rate), a2 = Math.exp(-2 * Math.PI * 200 / rate);
      for (let i = 0; i < l.length; i++) {
        const x = (l[i] + r[i]) / 2;
        peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
        sum += x * x;
        lo = a1 * lo + (1 - a1) * x; lo2 = a2 * lo2 + (1 - a2) * x;
        mid += (lo - lo2) ** 2;
      }
      const db = (v: number) => (10 * Math.log10(v / l.length + 1e-12)).toFixed(1);
      return { realtime: (secs * 1000) / ms, peak: (20 * Math.log10(peak)).toFixed(1), rms: db(sum), mid: db(mid), wav: music && bob ? [Array.from(l), Array.from(r)] : null };
    }
    return { music: await render(true, false), bob: await render(false, true), both: await render(true, true) };
  }, { frames, secs, audio });

  for (const [k, v] of Object.entries(result))
    console.log(`${k.padEnd(5)}: ${v.realtime.toFixed(0)}× real time, peak ${v.peak} dB, loudness ${v.rms} dB, 200-600 Hz ${v.mid} dB`);
  const [l, r] = result.both.wav!;
  const wav = Buffer.alloc(44 + l.length * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + l.length * 4, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(44100 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(l.length * 4, 40);
  for (let i = 0; i < l.length; i++) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(out, wav);
  console.log(`wrote ${out}, ${secs.toFixed(0)} s`);
} finally {
  await browser.close();
  vite.kill();
}
