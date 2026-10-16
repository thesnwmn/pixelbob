import { CAT, Cat, M, MATS, World, generate, type Preset } from "@pixelbob/sim";
import { GLRenderer, LOOKS, type LampDef, type View } from "./gl.ts";
import { Shade } from "./shade.ts";

const W = 480, H = 270, STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed")) || 7;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>("#view");
const hud = $("#hud");

let world: World, shade: Shade, lamps: LampDef[];
function reset(preset: Preset) {
  world = new World(W, H, seed);
  lamps = generate(world, preset, seed);
  shade = new Shade(world, seed);
}
reset((params.get("preset") as Preset) === "rock" ? "rock" : "demo");

let gl: GLRenderer;
try {
  gl = new GLRenderer(canvas, W, H);
} catch (e) {
  document.body.innerHTML = `<div id="err"><h2>Can't start the renderer</h2><p>${String(e)}</p><p>The sandbox needs WebGL2.</p></div>`;
  throw e;
}

// ---- Tools and palette ----

type Tool = "paint" | "dig" | "heat" | "cool" | "lamp" | "move";
const TOOLS: [Tool, string][] = [["dig", "Dig"], ["paint", "Paint"], ["heat", "Heat"], ["cool", "Cool"], ["lamp", "Lamp"], ["move", "Move"]];
const state = { tool: "paint" as Tool, mat: M.sand as number, size: 5, paused: false, look: "day", replace: false };

const toolEl = $("#tools");
for (const [t, label] of TOOLS) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset.tool = t;
  b.onclick = () => setTool(t);
  toolEl.append(b);
}
const matEl = $("#mats");
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const paletteMats = MATS.filter((m) => m.palette);
paletteMats.forEach((m, k) => {
  const b = document.createElement("button");
  b.className = "mat";
  b.dataset.mat = String(m.id);
  b.title = k < 9 ? `${m.name} (${k + 1})` : m.name;
  b.innerHTML = `<i style="background:${hex(m.colors[Math.floor(m.colors.length / 2)])}"></i>${m.name}`;
  b.onclick = () => { state.mat = m.id; setTool("paint"); };
  matEl.append(b);
});
function setTool(t: Tool) {
  state.tool = t;
  for (const b of toolEl.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", b.dataset.tool === t);
  for (const b of matEl.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", t === "paint" && Number(b.dataset.mat) === state.mat);
}
setTool("paint");

const sizeEl = $<HTMLInputElement>("#size");
sizeEl.oninput = () => (state.size = Number(sizeEl.value));
const lookEl = $<HTMLSelectElement>("#look");
lookEl.value = params.get("look") ?? "day";
state.look = lookEl.value;
lookEl.onchange = () => (state.look = lookEl.value);
const pauseEl = $<HTMLButtonElement>("#pause");
const togglePause = () => { state.paused = !state.paused; pauseEl.textContent = state.paused ? "Play" : "Pause"; pauseEl.classList.toggle("on", state.paused); };
pauseEl.onclick = togglePause;
$<HTMLButtonElement>("#stepbtn").onclick = () => world.step();
const resetEl = $<HTMLSelectElement>("#reset");
resetEl.onchange = () => { if (resetEl.value) reset(resetEl.value as Preset); resetEl.value = ""; };
const fsEl = $<HTMLButtonElement>("#fs");
if (!document.fullscreenEnabled) fsEl.style.display = "none";
fsEl.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));

// ---- Sizing: biggest fit, integer scale when it's close ----

function resize() {
  const box = $("#stage").getBoundingClientRect();
  let s = Math.min(box.width / W, box.height / H);
  const dpr = window.devicePixelRatio || 1;
  const si = Math.floor(s * dpr) / dpr; // whole device pixels per cell, if it costs little space
  if (si >= 1 / dpr && si / s > 0.85) s = si;
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
}
new ResizeObserver(resize).observe($("#stage"));
resize();

// ---- Camera: zoom and pan ----

const ZOOM_MIN = 1, ZOOM_MAX = 6;
const cam = { z: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(params.get("zoom")) || 1.5)), x: W * 0.45, y: H * 0.42 };
const zoomEl = $("#zoomval");
function view(): View {
  const w = W / cam.z, h = H / cam.z;
  return { x0: Math.max(0, Math.min(W - w, cam.x - w / 2)), y0: Math.max(0, Math.min(H - h, cam.y - h / 2)), w, h };
}
function clampCam() {
  const v = view();
  cam.x = v.x0 + v.w / 2; cam.y = v.y0 + v.h / 2;
  zoomEl.textContent = `${cam.z.toFixed(cam.z % 1 ? 1 : 0)}×`;
}
/** Zoom keeping the world point under (sx, sy) (0..1 across the canvas) fixed. */
function zoomAt(z: number, sx = 0.5, sy = 0.5) {
  const v = view();
  const px = v.x0 + sx * v.w, py = v.y0 + sy * v.h;
  cam.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  const w = W / cam.z, h = H / cam.z;
  cam.x = px - sx * w + w / 2; cam.y = py - sy * h + h / 2;
  clampCam();
}
const STEPS = [1, 1.5, 2, 3, 4, 6];
$<HTMLButtonElement>("#zin").onclick = () => zoomAt(STEPS.find((z) => z > cam.z + 0.01) ?? ZOOM_MAX);
$<HTMLButtonElement>("#zout").onclick = () => zoomAt([...STEPS].reverse().find((z) => z < cam.z - 0.01) ?? ZOOM_MIN);
$<HTMLButtonElement>("#zfit").onclick = () => zoomAt(1);
clampCam();

// ---- Pointer input ----

const ptr = { down: false, x: 0, y: 0, lx: 0, ly: 0, over: false, t0: 0 };
// Touch strokes start after a short delay, so the first finger of a pinch doesn't paint.
const TOUCH_DELAY = 90;
const armed = () => ptr.down && performance.now() - ptr.t0 >= 0;
const screen = (e: { clientX: number; clientY: number }) => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
};
const toCell = (e: { clientX: number; clientY: number }) => {
  const [u, v] = screen(e), vw = view();
  return [vw.x0 + u * vw.w, vw.y0 + v * vw.h] as const;
};
const fillFor = (m: number) => (CAT[m] === Cat.Static ? 1 : CAT[m] === Cat.Gas || CAT[m] === Cat.Fire ? 0.45 : 0.55);

function brush(x: number, y: number) {
  const r = state.size;
  if (state.tool === "dig") world.paint(x, y, r, M.air);
  else if (state.tool === "paint") world.paint(x, y, r, state.mat, { fill: fillFor(state.mat), replace: state.replace });
  else if (state.tool === "heat") world.heat(x, y, r * 1.5, 60);
  else if (state.tool === "cool") world.heat(x, y, r * 1.5, -8);
}
function strokeTo(x: number, y: number) {
  const d = Math.hypot(x - ptr.lx, y - ptr.ly), n = Math.max(1, Math.ceil(d / Math.max(1, state.size * 0.5)));
  for (let k = 1; k <= n; k++) brush(ptr.lx + ((x - ptr.lx) * k) / n, ptr.ly + ((y - ptr.ly) * k) / n);
  ptr.lx = x; ptr.ly = y;
}

// Every active pointer, for pinch-zoom and two-finger pan.
const touches = new Map<number, { clientX: number; clientY: number }>();
let gesture: { d0: number; z0: number; wx: number; wy: number } | null = null;
const mid = () => {
  const [a, b] = [...touches.values()];
  return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
};
function startGesture() {
  ptr.down = false;
  const m = mid(), [wx, wy] = toCell(m);
  gesture = { d0: Math.max(10, m.d), z0: cam.z, wx, wy };
}
let panFrom: { u: number; v: number; x: number; y: number } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, e);
  if (touches.size === 2) return startGesture();
  if (touches.size > 2) return;
  const [x, y] = toCell(e);
  Object.assign(ptr, { x, y, lx: x, ly: y });
  if (state.tool === "move" || e.button === 1) {
    const [u, v] = screen(e);
    panFrom = { u, v, x: cam.x, y: cam.y };
    return;
  }
  ptr.down = true;
  ptr.t0 = performance.now() + (e.pointerType === "touch" ? TOUCH_DELAY : 0);
  state.replace = e.shiftKey || e.button === 2;
  if (state.tool === "lamp") {
    ptr.down = false;
    const near = lamps.findIndex((l) => Math.hypot(l.x - x, l.y - y) < 8);
    if (near >= 0) lamps.splice(near, 1);
    else if (lamps.length < 16) lamps.push({ x: Math.floor(x), y: Math.floor(y), color: [1, 0.82, 0.55], radius: 110 });
    return;
  }
  if (armed()) brush(x, y);
});
canvas.addEventListener("pointermove", (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, e);
  if (gesture && touches.size >= 2) {
    // Pinch zooms; the world point under the fingers' midpoint follows them.
    const m = mid(), [u, v] = screen(m);
    cam.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, gesture.z0 * (m.d / gesture.d0)));
    const w = W / cam.z, h = H / cam.z;
    cam.x = gesture.wx - u * w + w / 2; cam.y = gesture.wy - v * h + h / 2;
    clampCam();
    return;
  }
  const [x, y] = toCell(e);
  ptr.x = x; ptr.y = y; ptr.over = true;
  if (panFrom) {
    const [u, v] = screen(e), vw = view();
    cam.x = panFrom.x - (u - panFrom.u) * vw.w; cam.y = panFrom.y - (v - panFrom.v) * vw.h;
    clampCam();
    return;
  }
  if (armed()) strokeTo(x, y);
  else if (ptr.down) { ptr.lx = x; ptr.ly = y; }
});
const up = (e: PointerEvent) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) gesture = null;
  if (touches.size === 0) { ptr.down = false; panFrom = null; }
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("pointerleave", () => (ptr.over = false));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [u, v] = screen(e);
  zoomAt(cam.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), u, v);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === " ") { togglePause(); e.preventDefault(); }
  else if (e.key === ".") world.step();
  else if (e.key === "[") sizeEl.value = String((state.size = Math.max(1, state.size - 1)));
  else if (e.key === "]") sizeEl.value = String((state.size = Math.min(24, state.size + 1)));
  else if (e.key === "d") setTool("dig");
  else if (e.key === "h") setTool("heat");
  else if (e.key === "c") setTool("cool");
  else if (e.key === "l") setTool("lamp");
  else if (e.key === "m") setTool("move");
  else if (e.key === "+" || e.key === "=") zoomAt(cam.z * 1.25);
  else if (e.key === "-") zoomAt(cam.z / 1.25);
  else if (e.key.startsWith("Arrow")) {
    const k = 12 / cam.z;
    cam.x += e.key === "ArrowLeft" ? -k * 4 : e.key === "ArrowRight" ? k * 4 : 0;
    cam.y += e.key === "ArrowUp" ? -k * 4 : e.key === "ArrowDown" ? k * 4 : 0;
    clampCam();
    e.preventDefault();
  }
  else if (/^[1-9]$/.test(e.key) && paletteMats[Number(e.key) - 1]) { state.mat = paletteMats[Number(e.key) - 1].id; setTool("paint"); }
});

// ---- Loop ----

let last = performance.now(), acc = 0, frame = 0, fps = 60, simMs = 0;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!state.paused) {
    acc += dt;
    let n = 0;
    const t0 = performance.now();
    while (acc >= STEP && n < 3) {
      // Holding still keeps pouring (and heating) under the pointer.
      if (armed() && state.tool !== "lamp" && state.tool !== "dig") brush(ptr.x, ptr.y);
      world.step();
      acc -= STEP;
      n++;
    }
    if (n === 3) acc = 0;
    if (n) simMs += ((performance.now() - t0) / n - simMs) * 0.1;
  } else if (ptr.down && (state.tool === "heat" || state.tool === "cool")) brush(ptr.x, ptr.y);
  shade.update(frame++);
  gl.render(shade.color, shade.emit, lamps, LOOKS[state.look] ?? LOOKS.day, view());
  let under = "";
  if (ptr.over) {
    const cx = Math.floor(ptr.x), cy = Math.floor(ptr.y);
    if (world.inside(cx, cy)) {
      const i = cy * W + cx;
      under = `\n${MATS[world.mat[i]].name} ${Math.round(world.temp[i])}°C`;
    }
  }
  hud.textContent = `${fps.toFixed(0)} fps · sim ${simMs.toFixed(1)} ms · chunks ${world.awakeCount()}/${world.cw * world.ch}${under}`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
