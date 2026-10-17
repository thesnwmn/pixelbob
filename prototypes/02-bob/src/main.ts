import { BobPainter, COURSE_H, COURSE_W, DEFAULTS, DEFAULT_MODEL, MODELS, RANGES, buildCourse, createBob, frozenness, runniness, sectionAt, type BobModel, type Course, type ModelKind, type Tweaks } from "@pixelbob/bob";
import { GLRenderer, LOOKS, Shade, type View } from "@pixelbob/render";
import { CAT, Cat, M, World } from "@pixelbob/sim";

const W = COURSE_W, H = COURSE_H, STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed")) || 7;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>("#view");
const hud = $("#hud"), note = $("#note");

// ---- Tweaks, saved in the URL ----

const tweaks: Tweaks = { ...DEFAULTS };
for (const k of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
  const v = params.get(k);
  if (v !== null && Number.isFinite(Number(v))) tweaks[k] = Number(v);
}
if (params.get("drive") === "crawl") tweaks.drive = "crawl";
let fixedTemp: number | null = params.has("temp") ? Number(params.get("temp")) : null;
// Which way of modelling Bob (docs/09-bob-models.md).
let kind: ModelKind = MODELS.find((m) => m.kind === params.get("model"))?.kind ?? DEFAULT_MODEL;

function saveUrl() {
  const q = new URLSearchParams();
  for (const k of Object.keys(RANGES) as (keyof typeof RANGES)[]) if (tweaks[k] !== DEFAULTS[k]) q.set(k, String(tweaks[k]));
  if (tweaks.drive !== DEFAULTS.drive) q.set("drive", tweaks.drive);
  if (fixedTemp !== null) q.set("temp", String(fixedTemp));
  if (kind !== DEFAULT_MODEL) q.set("model", kind);
  if (state.look !== "day") q.set("look", state.look);
  const s = q.toString();
  history.replaceState(null, "", s ? `?${s}` : location.pathname);
}

// ---- World, course and Bob ----

let world: World, shade: Shade, course: Course;
let bob: BobModel = createBob(kind, tweaks, seed);
const painter = new BobPainter();
let best = 0, startAt = 0, finishedAt = 0;
function rebuild() {
  world = new World(W, H, seed);
  course = buildCourse(world, seed);
  shade = new Shade(world, seed);
  respawn();
}
function respawn() {
  bob.tweaks = tweaks;
  // ?at=<x> starts him somewhere else along the course, to practise one section.
  const at = Number(params.get("at"));
  let sx = course.spawn.x, sy = course.spawn.y;
  if (at > 0 && at < W) {
    sx = Math.round(at);
    // The ground is the top of the solid run up from the bottom (not, say, a brazier overhead).
    let top = H - 1;
    while (top > 0 && CAT[world.mat[(top - 1) * W + sx]] !== Cat.Empty && CAT[world.mat[(top - 1) * W + sx]] !== Cat.Gas) top--;
    sy = top - tweaks.size - 3;
  }
  bob.spawn(world, sx, sy, 20, course.bits);
  bob.fixedTemp = fixedTemp;
  startAt = frame; finishedAt = 0;
  cam.x = sx; cam.y = sy;
}

// For debugging and scripted playthroughs from the browser console.
(window as unknown as { pixelbob: unknown }).pixelbob = { get bob() { return bob; }, get world() { return world; }, get course() { return course; } };

let gl: GLRenderer;
try {
  gl = new GLRenderer(canvas, W, H);
} catch (e) {
  document.body.innerHTML = `<div id="err"><h2>Can't start the renderer</h2><p>${String(e)}</p><p>The playground needs WebGL2.</p></div>`;
  throw e;
}

// ---- Panel ----

const LABELS: Record<keyof typeof RANGES, string> = {
  cohesion: "cohesion", memory: "memory", softness: "softness", muscle: "muscle", grip: "grip",
  speed: "speed", jump: "jump", air: "air ctrl", size: "size", gravity: "gravity", soak: "heat soak", hold: "heat hold", stringy: "stringy",
};
const panel = $("#panel"), sliders = $("#sliders");
const inputs = new Map<string, HTMLInputElement>();
for (const k of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
  const [lo, hi, st] = RANGES[k];
  const row = document.createElement("label");
  row.className = "slider";
  row.innerHTML = `<span style="text-align:left;color:inherit">${LABELS[k]}</span><input type="range" min="${lo}" max="${hi}" step="${st}"><span></span>`;
  const inp = row.querySelector("input")!, val = row.querySelectorAll("span")[1];
  const show = () => (val.textContent = String(+tweaks[k].toFixed(2)));
  inp.value = String(tweaks[k]);
  show();
  inp.oninput = () => { tweaks[k] = Number(inp.value); show(); saveUrl(); };
  inputs.set(k, inp);
  sliders.append(row);
}
const driveEl = $<HTMLSelectElement>("#drive");
driveEl.value = tweaks.drive;
driveEl.onchange = () => { tweaks.drive = driveEl.value === "crawl" ? "crawl" : "roll"; saveUrl(); };
// Model picker: a new Bob of the chosen kind, at the start (or ?at=).
const modelEl = $<HTMLSelectElement>("#model");
for (const m of MODELS) modelEl.append(new Option(m.name, m.kind));
modelEl.value = kind;
const showModel = () => {
  const m = MODELS.find((x) => x.kind === kind)!;
  modelEl.title = m.blurb;
  for (const [k, inp] of inputs) inp.closest("label")!.classList.toggle("unused", m.ignores.includes(k as keyof Tweaks));
};
modelEl.onchange = () => {
  kind = modelEl.value as ModelKind;
  bob = createBob(kind, tweaks, seed);
  respawn();
  showModel();
  saveUrl();
  modelEl.blur();
};
showModel();
const worldTempEl = $<HTMLInputElement>("#worldtemp"), tempEl = $<HTMLInputElement>("#temp"), tempVal = $("#tempval");
const syncTemp = () => {
  worldTempEl.checked = fixedTemp === null;
  tempEl.disabled = fixedTemp === null;
  if (fixedTemp !== null) tempEl.value = String(fixedTemp);
  tempVal.textContent = fixedTemp === null ? "world" : `${fixedTemp}°C`;
  bob.fixedTemp = fixedTemp;
};
worldTempEl.onchange = () => { fixedTemp = worldTempEl.checked ? null : Number(tempEl.value); syncTemp(); saveUrl(); };
tempEl.oninput = () => { fixedTemp = Number(tempEl.value); syncTemp(); saveUrl(); };
syncTemp();
$<HTMLButtonElement>("#defaults").onclick = () => {
  Object.assign(tweaks, DEFAULTS);
  for (const [k, inp] of inputs) { inp.value = String(tweaks[k as keyof typeof RANGES]); inp.dispatchEvent(new Event("input")); }
  driveEl.value = tweaks.drive;
  fixedTemp = null; syncTemp(); saveUrl();
};
const togglePanel = (open = panel.hidden !== false) => { panel.hidden = !open; $("#tweaks").classList.toggle("on", open); };
$<HTMLButtonElement>("#tweaks").onclick = () => togglePanel();
$<HTMLButtonElement>("#close").onclick = () => togglePanel(false);
if (window.innerWidth > 900) togglePanel(true);

// ---- Bar: modes, edit tools ----

type Mode = "play" | "edit";
type Tool = "dig" | "rock" | "ice" | "spikes" | "moss" | "resin" | "gum" | "sand" | "water" | "lava" | "heat" | "cool";
const TOOL_MAT: Partial<Record<Tool, number>> = { dig: M.air, rock: M.rock, ice: M.ice, spikes: M.spike, moss: M.moss, resin: M.resin, gum: M.gum, sand: M.sand, water: M.water, lava: M.lava };
/** Painted over whatever is there (not only into air). */
const SOLID_TOOLS = new Set<number>([M.air, M.rock, M.ice, M.spike, M.moss, M.resin, M.gum]);
const state = { mode: "play" as Mode, tool: "dig" as Tool, size: 4, paused: false, look: params.get("look") ?? "day" };
const toolEl = $("#tools");
for (const t of Object.keys({ dig: 1, rock: 1, ice: 1, spikes: 1, moss: 1, resin: 1, gum: 1, sand: 1, water: 1, lava: 1, heat: 1, cool: 1 }) as Tool[]) {
  const b = document.createElement("button");
  b.textContent = t[0].toUpperCase() + t.slice(1);
  b.dataset.tool = t;
  b.onclick = () => { setMode("edit"); setTool(t); };
  toolEl.append(b);
}
function setTool(t: Tool) {
  state.tool = t;
  for (const b of toolEl.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", state.mode === "edit" && b.dataset.tool === t);
}
function setMode(m: Mode) {
  state.mode = m;
  document.body.classList.toggle("play", m === "play");
  for (const b of $("#modes").querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", b.dataset.mode === m);
  setTool(state.tool);
}
for (const b of $("#modes").querySelectorAll<HTMLButtonElement>("button")) b.onclick = () => setMode(b.dataset.mode as Mode);
setMode("play");
const sizeEl = $<HTMLInputElement>("#size");
sizeEl.oninput = () => (state.size = Number(sizeEl.value));
const lookEl = $<HTMLSelectElement>("#look");
lookEl.value = state.look;
lookEl.onchange = () => { state.look = lookEl.value; saveUrl(); };
const pauseEl = $<HTMLButtonElement>("#pause");
const togglePause = () => { state.paused = !state.paused; pauseEl.textContent = state.paused ? "Play" : "Pause"; pauseEl.classList.toggle("on", state.paused); };
pauseEl.onclick = togglePause;
$<HTMLButtonElement>("#respawn").onclick = () => respawn();
$<HTMLButtonElement>("#rebuild").onclick = () => rebuild();
const fsEl = $<HTMLButtonElement>("#fs");
if (!document.fullscreenEnabled) fsEl.style.display = "none";
fsEl.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));

// ---- Sizing and camera ----

function resize() {
  const box = $("#stage").getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(box.width)}px`;
  canvas.style.height = `${Math.floor(box.height)}px`;
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
}
new ResizeObserver(resize).observe($("#stage"));
resize();

const ZOOM_MIN = 1, ZOOM_MAX = 8;
const cam = { z: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(params.get("zoom")) || 3)), x: 0, y: 0, follow: true };
/** The view keeps the canvas's aspect; at zoom z about 330 / z cells fit its height. */
function view(): View {
  const aspect = canvas.width / Math.max(1, canvas.height);
  let h = Math.min(H, 330 / cam.z), w = h * aspect;
  if (w > W) { w = W; h = w / aspect; }
  return { x0: Math.max(0, Math.min(W - w, cam.x - w / 2)), y0: Math.max(0, Math.min(H - h, cam.y - h / 2)), w, h };
}
const zoomEl = $("#zoomval");
const setZoom = (z: number) => { cam.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); zoomEl.textContent = `${+cam.z.toFixed(1)}×`; };
setZoom(cam.z);
$<HTMLButtonElement>("#zin").onclick = () => setZoom(cam.z * 1.25);
$<HTMLButtonElement>("#zout").onclick = () => setZoom(cam.z / 1.25);

// ---- Input: keyboard, touch sticks, edit brush ----

const keys = new Set<string>();
const input = { move: 0, jump: false, down: 0 };
const stick = { id: -1, x0: 0, y0: 0, move: 0, down: 0 }, jumpTouch = new Set<number>();
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  keys.add(e.key.toLowerCase());
  if (e.key === "p") togglePause();
  else if (e.key === "r") respawn();
  else if (e.key === "t") togglePanel();
  else if (e.key === "+" || e.key === "=") setZoom(cam.z * 1.25);
  else if (e.key === "-") setZoom(cam.z / 1.25);
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
function readInput() {
  const k = (...a: string[]) => a.some((x) => keys.has(x));
  input.move = (k("d", "arrowright") ? 1 : 0) - (k("a", "arrowleft") ? 1 : 0) || stick.move;
  input.down = k("s", "arrowdown") ? 1 : stick.down;
  input.jump = k(" ", "w", "arrowup") || jumpTouch.size > 0;
}

const ptr = { down: false, x: 0, y: 0, lx: 0, ly: 0 };
const toCell = (e: { clientX: number; clientY: number }) => {
  const r = canvas.getBoundingClientRect(), v = view();
  return [v.x0 + ((e.clientX - r.left) / r.width) * v.w, v.y0 + ((e.clientY - r.top) / r.height) * v.h] as const;
};
function brush(x: number, y: number) {
  const r = state.size, m = TOOL_MAT[state.tool];
  if (m !== undefined) world.paint(x, y, r, m, { replace: SOLID_TOOLS.has(m), fill: CAT[m] === Cat.Liquid || CAT[m] === Cat.Powder ? 0.6 : 1 });
  else world.heat(x, y, r * 1.5, state.tool === "heat" ? 40 : -10);
}
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (state.mode === "play") {
    // Touch: left half is a stick (drag), right half is the jump button.
    const r = canvas.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 2) { stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.move = stick.down = 0; }
    else jumpTouch.add(e.pointerId);
    return;
  }
  const [x, y] = toCell(e);
  Object.assign(ptr, { down: true, x, y, lx: x, ly: y });
  brush(x, y);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === stick.id) {
    stick.move = Math.max(-1, Math.min(1, (e.clientX - stick.x0) / 40));
    stick.down = Math.max(0, Math.min(1, (e.clientY - stick.y0 - 15) / 30));
    return;
  }
  if (!ptr.down) return;
  const [x, y] = toCell(e);
  const d = Math.hypot(x - ptr.lx, y - ptr.ly), n = Math.max(1, Math.ceil(d / Math.max(1, state.size * 0.5)));
  for (let k = 1; k <= n; k++) brush(ptr.lx + ((x - ptr.lx) * k) / n, ptr.ly + ((y - ptr.ly) * k) / n);
  Object.assign(ptr, { x, y, lx: x, ly: y });
});
const up = (e: PointerEvent) => {
  if (e.pointerId === stick.id) { stick.id = -1; stick.move = stick.down = 0; }
  jumpTouch.delete(e.pointerId);
  ptr.down = false;
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(cam.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); }, { passive: false });

// ---- Loop ----

let last = performance.now(), acc = 0, frame = 0, fps = 60, simMs = 0;
rebuild();

function stateName(t: number): string {
  if (frozenness(t) >= 1) return "frozen";
  if (frozenness(t) > 0) return "cold";
  if (runniness(t) >= 1) return "runny";
  if (runniness(t) > 0) return "warm";
  return "normal";
}

function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  readInput();
  if (!state.paused) {
    acc += dt;
    let n = 0;
    const t0 = performance.now();
    while (acc >= STEP && n < 3) {
      if (ptr.down && state.mode === "edit" && state.tool !== "dig") brush(ptr.x, ptr.y);
      world.step();
      bob.step(world, input);
      acc -= STEP;
      n++;
      frame++;
    }
    if (n === 3) acc = 0;
    if (n) simMs += ((performance.now() - t0) / n - simMs) * 0.1;
  }
  const p = bob.main;
  if (p && cam.follow) {
    // Follow with a little look-ahead in the direction he's moving.
    const v = view();
    const tx = p.cx + Math.max(-1, Math.min(1, p.vx / 120)) * v.w * 0.18, ty = p.cy - v.h * 0.08;
    cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
  }
  shade.update(frame);
  painter.draw(bob.view(), world, shade.color, shade.emit, frame);
  // Less fade into solid ground than the sandbox: here the terrain's shape is what matters.
  const look = LOOKS[state.look] ?? LOOKS.day;
  gl.render(shade.color, shade.emit, course.lamps, { ...look, depth: look.depth * 0.55 }, view());

  const f = course.finish, home = bob.countIn(f.x0, f.y0, f.x1, f.y1), pct = Math.round((home / bob.total) * 100);
  if (pct > 0 && !finishedAt && p && p.cx >= f.x0) finishedAt = frame;
  best = Math.max(best, pct);
  const alive = Math.round((bob.count / bob.total) * 100);
  const lost = Object.entries(bob.losses).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ");
  const time = ((finishedAt || frame) - startAt) / 60;
  hud.textContent =
    `${fps.toFixed(0)} fps · sim ${simMs.toFixed(1)} ms · ${MODELS.find((m) => m.kind === kind)!.name}\n` +
    (p ? `Bob ${alive}% · ${bob.pieces.length} piece${bob.pieces.length > 1 ? "s" : ""} · main ${Math.round((p.len / bob.total) * 100)}% · ${p.temp.toFixed(0)}°C ${stateName(p.temp)}\n` : "Bob is gone. R to respawn.\n") +
    (lost ? `lost: ${lost}\n` : "") +
    `at the finish: ${pct}% (best ${best}%)${finishedAt ? ` in ${time.toFixed(1)} s` : ""}`;
  const s = p && sectionAt(course, p.cx);
  note.textContent = s ? `${s.name}: ${s.note}` : "";
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
