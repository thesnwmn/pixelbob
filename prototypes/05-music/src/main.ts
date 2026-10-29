// The music spike's page: the first Green level from the game (its play.ts, levels and a kept
// replay, read from game/), drawn and played like the game, with Bob's voices from the audio
// spike and the generative score on one audio context. Listen plays the kept run, so you can
// just watch and listen.
import { BobPainter, type Input } from "@pixelbob/bob";
import { GLRenderer, LOOKS, Shade, type View } from "@pixelbob/render";
import { lamps as lanterns, paintCheckpoints } from "../../../game/src/checkpoint.ts";
import { addLevel, parseLevel } from "../../../game/src/levels.ts";
import { Play, STEP } from "../../../game/src/play.ts";
import { decodePngAsync } from "../../../game/src/png.ts";
import { type Frame, parseReplayFile } from "../../../game/src/replay.ts";
import { parseScenario } from "../../../game/src/scenario.ts";
import { readStick } from "../../../game/src/stick.ts";
import levelRaw from "../../../game/levels/green-1-hills/level.json";
import pngUrl from "../../../game/levels/green-1-hills/materials.png?url";
import replayRaw from "../../../game/replays/green-1-hills-run.json";
import scenarioRaw from "../../../game/scenarios/green-1-hills.json";
import { Listener } from "../../04-audio/src/listen.ts";
import { Synth } from "../../04-audio/src/synth.ts";
import { Band } from "./band.ts";
import { Follower, MOOD_KEYS } from "./follow.ts";
import { Conductor, PARTS } from "./score.ts";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const fail = (title: string, why: string) => {
  $("#error .box").innerHTML = `<h2>${title}</h2><p>${why.replace(/[&<>"]/g, "")}</p>`;
  $("#error").hidden = false;
  throw new Error(`${title}: ${why}`);
};

// ---- The level and the run ----

const { scenario } = parseScenario("green-1-hills", scenarioRaw);
if (!scenario) fail("The scenario is broken", "game/scenarios/green-1-hills.json");
const image = await decodePngAsync(new Uint8Array(await (await fetch(pngUrl)).arrayBuffer()));
const parsed = parseLevel("green-1-hills", levelRaw, image);
if (!parsed.level) fail("The level is broken", parsed.errors.join("; "));
addLevel("green-1-hills", parsed.level!);
const kept = parseReplayFile("green-1-hills-run", replayRaw).file;
const play = new Play(scenario!);
const follower = new Follower(play.level.world, play.start().x, play.level.finish.x0);

// ---- Renderer and camera, as the game has them ----

const canvas = $<HTMLCanvasElement>("#view");
let gl: GLRenderer;
try {
  gl = new GLRenderer(canvas, play.level.world.w, play.level.world.h);
} catch (e) {
  fail("Can't start the renderer", `${e}. It needs WebGL2.`);
}
const painter = new BobPainter();
let world = play.level.world, shade = new Shade(world, scenario!.seed);
const look = LOOKS[scenario!.camera.look] ?? LOOKS.day;
function resize() {
  const box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();
const cam = { z: scenario!.camera.zoom, x: play.start().x, y: play.start().y };
function view(): View {
  const { w: W, h: H } = play.level.world;
  const aspect = canvas.width / Math.max(1, canvas.height);
  let h = Math.min(H, (330 / cam.z) / Math.min(1, aspect)), w = h * aspect;
  if (w > W) { w = W; h = w / aspect; }
  return { x0: Math.max(0, Math.min(W - w, cam.x - w / 2)), y0: Math.max(0, Math.min(H - h, cam.y - h / 2)), w, h };
}

// ---- Sound: Bob's voices and the band on one context ----

const ear = new Listener();
ear.reset(play.bob);
let synth: Synth | null = null, band: Band | null = null, conductor: Conductor | null = null;
const musicEl = $<HTMLInputElement>("#music"), bobEl = $<HTMLInputElement>("#bob");
const params = new URLSearchParams(location.search);
musicEl.value = params.get("music") ?? "0.3";
bobEl.value = params.get("bob") ?? "0.6";
const soundEl = $<HTMLButtonElement>("#sound");
soundEl.onclick = async () => {
  if (!band) {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    band = new Band(Number(musicEl.value), ctx);
    synth = new Synth(Number(bobEl.value), ctx);
    for (const p of PARTS) band.on[p] = partOn[p];
    conductor = new Conductor(scenario!.seed, ctx.currentTime + 0.1);
  } else {
    const ctx = band.ctx as AudioContext;
    await (ctx.state === "running" ? ctx.suspend() : ctx.resume());
  }
  const on = band.ctx.state === "running";
  soundEl.textContent = on ? "Sound off" : "Sound on";
  soundEl.classList.toggle("primary", !on);
};
const saveUrl = () => {
  params.set("music", musicEl.value); params.set("bob", bobEl.value);
  for (const p of PARTS) if (partOn[p]) params.delete(`no-${p}`); else params.set(`no-${p}`, "1");
  history.replaceState(null, "", `?${params}`);
};
musicEl.oninput = () => { if (band) band.volume = Number(musicEl.value); saveUrl(); };
bobEl.oninput = () => { if (synth) synth.volume = Number(bobEl.value); saveUrl(); };
const partOn = Object.fromEntries(PARTS.map((p) => [p, !params.has(`no-${p}`)])) as Record<(typeof PARTS)[number], boolean>;
$("#parts").innerHTML = PARTS.map((p) => `<button data-part="${p}" class="${partOn[p] ? "on" : ""}">${p}</button>`).join("");
for (const b of document.querySelectorAll<HTMLButtonElement>("#parts button")) {
  const p = b.dataset.part as (typeof PARTS)[number];
  b.onclick = () => { partOn[p] = !partOn[p]; b.classList.toggle("on", partOn[p]); if (band) band.on[p] = partOn[p]; saveUrl(); };
}
const panel = $("#panel");
$<HTMLButtonElement>("#mix").onclick = () => { panel.hidden = !panel.hidden; };
$<HTMLButtonElement>("#close").onclick = () => { panel.hidden = true; };

// ---- Bar ----

let paused = false;
const pauseEl = $<HTMLButtonElement>("#pause");
const togglePause = () => { paused = !paused; pauseEl.textContent = paused ? "Play" : "Pause"; pauseEl.classList.toggle("on", paused); };
pauseEl.onclick = togglePause;
/** The kept run being played back, and how far into it: the player's input waits until it ends. */
let demo: Frame[] | null = null, demoAt = 0;
const listenEl = $<HTMLButtonElement>("#listen");
if (!kept) listenEl.hidden = true;
function listen(on: boolean) {
  play.restart();
  demo = on && kept ? kept.replay.frames : null;
  demoAt = 0;
  listenEl.classList.toggle("on", !!demo);
  if (!band && on) soundEl.click();
}
listenEl.onclick = () => listen(!demo);
$<HTMLButtonElement>("#restart").onclick = () => listen(false);

// ---- Input: keyboard and touch, as the game has them ----

const keys = new Set<string>();
const input: Input = { move: 0, jump: false, down: 0, up: 0 };
const JUMP_KEYS = [" ", "w", "arrowup"];
let jumpTap = false, backTap = false;
const stick = { id: -1, x0: 0, y0: 0, move: 0, down: 0, up: 0 }, jumpTouch = new Set<number>();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (e.repeat) { if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault(); return; }
  if (k === "p") togglePause();
  else if (k === "l") listen(!demo);
  else if (k === "r") backTap = true;
  keys.add(k);
  if (JUMP_KEYS.includes(k)) jumpTap = true;
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
function readInput() {
  const k = (...a: string[]) => a.some((x) => keys.has(x));
  input.move = (k("d", "arrowright") ? 1 : 0) - (k("a", "arrowleft") ? 1 : 0) || stick.move;
  input.down = k("s", "arrowdown") ? 1 : stick.down;
  input.up = k("w", "arrowup") ? 1 : stick.up;
  input.jump = k(...JUMP_KEYS) || jumpTouch.size > 0 || jumpTap;
}
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  if (e.clientX - r.left < r.width / 2) Object.assign(stick, { id: e.pointerId, x0: e.clientX, y0: e.clientY, move: 0, down: 0, up: 0 });
  else { jumpTouch.add(e.pointerId); jumpTap = true; }
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === stick.id) readStick(e.clientX - stick.x0, e.clientY - stick.y0, stick);
});
const up = (e: PointerEvent) => {
  if (e.pointerId === stick.id) Object.assign(stick, { id: -1, move: 0, down: 0, up: 0 });
  jumpTouch.delete(e.pointerId);
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- Loop ----

const hud = $("#hud");
const bars = (v: number) => "▁▂▃▄▅▆▇█"[Math.max(0, Math.min(7, Math.floor(v * 8)))];
let last = performance.now(), acc = 0, musicUs = 0, earUs = 0;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  readInput();
  if (paused) backTap = false;
  else {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 3) {
      if (demo) {
        play.step(demo[demoAt++]);
        if (demoAt >= demo.length) { demo = null; listenEl.classList.remove("on"); }
      } else play.step({ ...input, back: backTap });
      backTap = false;
      acc -= STEP; n++;
      if (play.level.world !== world) {
        // Bob came back at a checkpoint: a new world, and a respawn mustn't sound like a landing.
        world = play.level.world; shade = new Shade(world, scenario!.seed); ear.reset(play.bob);
        const p = play.bob.main;
        if (p) { cam.x = p.cx; cam.y = p.cy; }
      }
      const t0 = performance.now();
      const mood = follower.follow(play.bob, STEP);
      // Off (suspended), notes would queue at a frozen clock and all play on resume: don't listen.
      if (band && synth && conductor && band.ctx.state === "running") {
        const t1 = performance.now();
        const cues = ear.hear(play.bob, world);
        synth.update(cues);
        const ears = performance.now() - t1;
        earUs = earUs * 0.95 + ears * 1000 * 0.05;
        const hit = Math.max(cues.impact / 200, cues.jump ? 0.4 + 0.6 * cues.jump : 0, cues.splash / 150);
        if (hit > 0.15) band.duck(hit);
        band.follow(mood);
        const clock = band.ctx.currentTime;
        // After a stall (a hidden tab), don't rush to catch up: carry on from now.
        if (conductor.next < clock) conductor.next = clock + 0.02;
        for (const note of conductor.advance(mood, clock + 0.12)) band.play(note);
        musicUs = musicUs * 0.95 + (performance.now() - t0 - ears) * 1000 * 0.05;
      }
    }
    if (n) jumpTap = false;
    if (n === 3) acc = 0;
  }
  const { bob, level } = play, p = bob.main;
  if (p) {
    const v = view();
    const tx = p.cx + Math.max(-1, Math.min(1, p.vx / 120)) * v.w * 0.18, ty = p.cy - v.h * 0.08;
    cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
  }
  shade.update(play.frame);
  paintCheckpoints(level.world, shade.color, shade.emit, level.checkpoints, play.lit, play.frame);
  painter.draw(bob.view(), level.world, shade.color, shade.emit, play.frame);
  const lamps = [...level.lamps, ...lanterns(level.world, level.checkpoints, play.lit)];
  gl.render(shade.color, shade.emit, lamps, { ...look, depth: look.depth * 0.55 }, view());

  const m = follower.mood;
  hud.textContent =
    `${demo ? "Listening to a kept run (L to stop)" : scenario!.title}\n` +
    MOOD_KEYS.map((k) => `${bars(m[k])} ${k}`).join("\n") + "\n" +
    (band ? `music ${musicUs.toFixed(0)} µs a frame, ${band.live} notes · Bob's voices ${earUs.toFixed(0)} µs` : "");
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
