// The game in the browser: picks the scenario from `?scenario=<id>`, shows its handoff
// card, runs it (play.ts) with keyboard and touch, draws it, and has the feedback button.
import { BobPainter, type Input } from "@pixelbob/bob";
import { GLRenderer, LOOKS, Shade, type View } from "@pixelbob/render";
import { lamps as lanterns, paintCheckpoints } from "./checkpoint.ts";
import { LEVELS, addLevel, parseLevel } from "./levels.ts";
import { Play, STEP } from "./play.ts";
import { decodePngAsync } from "./png.ts";
import { type Feedback, buildName, report } from "./report.ts";
import { type Scenario, parseScenario } from "./scenario.ts";

declare const __COMMIT__: string;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---- The scenario ----

const files = import.meta.glob<unknown>("../scenarios/*.json", { eager: true, import: "default" });
const scenarios = new Map<string, Scenario>();
const broken: string[] = [];
for (const [path, raw] of Object.entries(files)) {
  const id = path.replace(/^.*\/|\.json$/g, "");
  const { scenario, errors } = parseScenario(id, raw);
  if (scenario) scenarios.set(id, scenario);
  else broken.push(`${id}: ${errors.join("; ")}`);
}
const params = new URLSearchParams(location.search);
const asked = params.get("scenario");
const scenario = scenarios.get(asked || "start");
if (!scenario) {
  const list = [...scenarios.values()].map((s) => `<li><a href="?scenario=${esc(s.id)}">${esc(s.id)}</a>: ${esc(s.title)}</li>`).join("");
  $("#error .box").innerHTML =
    `<h2>No scenario "${esc(asked || "start")}"</h2>` +
    (broken.length ? `<p class="meta">Broken: ${broken.map(esc).join("<br>")}</p>` : "") +
    `<p>These are in this build:</p><ul>${list}</ul>`;
  $("#error").hidden = false;
  throw new Error(`no scenario ${asked}`);
}
// A painted level is read from game/levels/<id>/ the first time a scenario needs it.
const levelFiles = import.meta.glob<unknown>("../levels/*/level.json", { eager: true, import: "default" });
const levelPngs = import.meta.glob<string>("../levels/*/materials.png", { query: "?url", import: "default" });
if (!LEVELS[scenario.level]) {
  const at = `../levels/${scenario.level}/`;
  const url = await levelPngs[`${at}materials.png`]?.();
  const errors: string[] = [];
  try {
    if (!url || !(at + "level.json" in levelFiles)) throw new Error("the level's folder is missing a file");
    const image = await decodePngAsync(new Uint8Array(await (await fetch(url)).arrayBuffer()));
    const { level, errors: bad } = parseLevel(scenario.level, levelFiles[at + "level.json"], image);
    if (level) addLevel(scenario.level, level);
    errors.push(...bad);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (errors.length) {
    $("#error .box").innerHTML = `<h2>The level "${esc(scenario.level)}" is broken</h2><p class="meta">${errors.map(esc).join("<br>")}</p>`;
    $("#error").hidden = false;
    throw new Error(`level ${scenario.level}: ${errors.join("; ")}`);
  }
}

document.title = scenario.card ? `${scenario.title} · Pixelbob` : "Pixelbob";
const play = new Play(scenario);

// ---- Renderer ----

const canvas = $<HTMLCanvasElement>("#view");
let gl: GLRenderer;
try {
  gl = new GLRenderer(canvas, play.level.world.w, play.level.world.h);
} catch (e) {
  $("#error .box").innerHTML = `<h2>Can't start the renderer</h2><p>${esc(String(e))}</p><p>The game needs WebGL2.</p>`;
  $("#error").hidden = false;
  throw e;
}
const painter = new BobPainter();
let shade = new Shade(play.level.world, scenario.seed);
const look = LOOKS[scenario.camera.look] ?? LOOKS.day;

// For debugging and scripted playthroughs from the browser console.
(window as unknown as { pixelbob: unknown }).pixelbob = { play, scenarios };

function restart() {
  play.restart();
  best = 0;
}
/** Each time Bob comes back the level is rebuilt: shade the new world, and jump the camera to him. */
let world = play.level.world;
function followWorld() {
  if (play.level.world === world) return;
  world = play.level.world;
  shade = new Shade(world, scenario!.seed);
  const p = play.bob.main;
  if (p) { cam.x = p.cx; cam.y = p.cy; }
}

// ---- Camera ----

function resize() {
  const box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

const cam = { z: scenario.camera.zoom, x: play.start().x, y: play.start().y };
/** The view keeps the canvas's aspect; at zoom z about 330 / z cells fit its height (its width, on a portrait screen). */
function view(): View {
  const { w: W, h: H } = play.level.world;
  const aspect = canvas.width / Math.max(1, canvas.height);
  let h = Math.min(H, (330 / cam.z) / Math.min(1, aspect)), w = h * aspect;
  if (w > W) { w = W; h = w / aspect; }
  return { x0: Math.max(0, Math.min(W - w, cam.x - w / 2)), y0: Math.max(0, Math.min(H - h, cam.y - h / 2)), w, h };
}

// ---- Sheets: the handoff card and the feedback form ----

const cardEl = $("#card"), feedbackEl = $("#feedback");
const sheetOpen = () => cardEl.hidden === false || feedbackEl.hidden === false;
const fill = (id: string, items: string[]) => {
  $(`#${id}`).innerHTML = items.map((s) => `<li>${esc(s)}</li>`).join("");
  $(`#${id}`).parentElement!.hidden = items.length === 0;
};
if (scenario.card) {
  const c = scenario.card;
  $("#cardtitle").textContent = scenario.title;
  $("#changed").textContent = c.changed;
  fill("try", c.try);
  fill("lookfor", c.lookFor);
  fill("known", c.known);
  $("#cardbtn").hidden = false;
  cardEl.hidden = false;
}
const showCard = (open: boolean) => { if (scenario.card) cardEl.hidden = !open; };
$<HTMLButtonElement>("#cardbtn").onclick = () => showCard(true);
$<HTMLButtonElement>("#play").onclick = () => showCard(false);

for (const el of document.querySelectorAll<HTMLElement>(".scale[data-name]")) {
  el.innerHTML = [1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${el.dataset.name}" value="${n}" />${n}</label>`).join("");
}
const questions = scenario.card?.questions ?? [];
$("#questions").innerHTML = questions.map((q, i) => `<label class="text">${esc(q)}<textarea data-q="${i}" rows="2"></textarea></label>`).join("");
const form = $<HTMLFormElement>("#form"), out = $<HTMLTextAreaElement>("#out"), copied = $("#copied");
const build = buildName(location.pathname);
let openedAt = 0;
function showFeedback(open: boolean) {
  feedbackEl.hidden = !open;
  if (!open) return;
  openedAt = play.seconds();
  $("#fbmeta").textContent = `${build} (${__COMMIT__}) · ${scenario!.id} · ${openedAt.toFixed(0)} s in`;
  out.hidden = true;
  copied.textContent = "";
}
$<HTMLButtonElement>("#feedbackbtn").onclick = () => showFeedback(true);
$<HTMLButtonElement>("#close").onclick = () => showFeedback(false);
form.onsubmit = async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const num = (k: string) => (data.get(k) ? Number(data.get(k)) : undefined);
  const f: Feedback = {
    build,
    commit: __COMMIT__,
    browser: navigator.userAgent,
    scenario: scenario!.id,
    seconds: openedAt,
    fun: num("fun"),
    difficulty: (data.get("difficulty") as Feedback["difficulty"]) ?? undefined,
    frustration: num("frustration"),
    notes: $<HTMLTextAreaElement>("#notes").value,
    answers: questions.map((question, i) => ({ question, answer: form.querySelector<HTMLTextAreaElement>(`[data-q="${i}"]`)!.value })),
    replay: play.replay(),
  };
  const text = report(f);
  out.value = text;
  try {
    await navigator.clipboard.writeText(text);
    copied.textContent = "Copied. Paste it into a session with /playtest.";
  } catch {
    // No clipboard (an insecure context, or permission refused): show it to copy by hand.
    out.hidden = false;
    out.select();
    copied.textContent = "Couldn't copy: select the report above and copy it, then paste it into /playtest.";
  }
};

// ---- Bar ----

let paused = false;
const pauseEl = $<HTMLButtonElement>("#pause");
const togglePause = () => { paused = !paused; pauseEl.textContent = paused ? "Play" : "Pause"; pauseEl.classList.toggle("on", paused); };
pauseEl.onclick = togglePause;
$<HTMLButtonElement>("#restart").onclick = () => restart();
$<HTMLButtonElement>("#back").onclick = () => { backTap = true; };
const fsEl = $<HTMLButtonElement>("#fs");
if (!document.fullscreenEnabled) fsEl.hidden = true;
fsEl.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));

// ---- Input: keyboard and touch ----

const keys = new Set<string>();
const input: Input = { move: 0, jump: false, down: 0, up: 0 };
const JUMP_KEYS = [" ", "w", "arrowup"];
/** A jump pressed since the last step, so a tap shorter than a frame still reaches the sim. */
let jumpTap = false;
/** Back to the checkpoint asked for since the last step: it's one frame's input, recorded in the replay. */
let backTap = false;
const stick = { id: -1, x0: 0, y0: 0, move: 0, down: 0, up: 0 }, jumpTouch = new Set<number>();
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
    if (e.key === "Escape") { showFeedback(false); canvas.focus(); }
    return;
  }
  const k = e.key.toLowerCase();
  // Held keys repeat: only movement cares, and it reads the held set.
  if (e.repeat) { if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault(); return; }
  if (k === "escape") { showCard(false); showFeedback(false); }
  else if (k === "f") showFeedback(feedbackEl.hidden !== false);
  else if (k === "h" || k === "?") showCard(cardEl.hidden !== false);
  else if (sheetOpen()) return;
  else if (k === "p") togglePause();
  else if (k === "r") backTap = true;
  keys.add(k);
  if (JUMP_KEYS.includes(k)) jumpTap = true;
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
function readInput() {
  if (sheetOpen()) keys.clear();
  const k = (...a: string[]) => a.some((x) => keys.has(x));
  input.move = (k("d", "arrowright") ? 1 : 0) - (k("a", "arrowleft") ? 1 : 0) || stick.move;
  input.down = k("s", "arrowdown") ? 1 : stick.down;
  // Up climbs a tacky wall he's pushing into (and, off a wall, jumps like space).
  input.up = k("w", "arrowup") ? 1 : stick.up;
  input.jump = k(...JUMP_KEYS) || jumpTouch.size > 0 || jumpTap;
}
// Touch: the left half is a stick (drag), the right half is the jump button.
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  if (e.clientX - r.left < r.width / 2) Object.assign(stick, { id: e.pointerId, x0: e.clientX, y0: e.clientY, move: 0, down: 0, up: 0 });
  else { jumpTouch.add(e.pointerId); jumpTap = true; }
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stick.id) return;
  stick.move = Math.max(-1, Math.min(1, (e.clientX - stick.x0) / 40));
  stick.down = Math.max(0, Math.min(1, (e.clientY - stick.y0 - 15) / 30));
  stick.up = Math.max(0, Math.min(1, (stick.y0 - e.clientY - 15) / 30));
});
const up = (e: PointerEvent) => {
  if (e.pointerId === stick.id) Object.assign(stick, { id: -1, move: 0, down: 0, up: 0 });
  jumpTouch.delete(e.pointerId);
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- Loop ----

const hud = $("#hud"), note = $("#note");
let last = performance.now(), acc = 0, best = 0;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  readInput();
  // The game waits while you read the card or fill in the form.
  if (!paused && !sheetOpen()) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 3) { play.step({ ...input, back: backTap }); backTap = false; acc -= STEP; n++; }
    if (n) jumpTap = false;
    if (n === 3) acc = 0;
  }
  followWorld();
  const { bob, level } = play, p = bob.main;
  if (p) {
    // Follow with a little look-ahead in the direction he's moving.
    const v = view();
    const tx = p.cx + Math.max(-1, Math.min(1, p.vx / 120)) * v.w * 0.18, ty = p.cy - v.h * 0.08;
    cam.x += (tx - cam.x) * 0.08; cam.y += (ty - cam.y) * 0.08;
  }
  shade.update(play.frame);
  paintCheckpoints(level.world, shade.color, shade.emit, level.checkpoints, play.lit, play.frame);
  painter.draw(bob.view(), level.world, shade.color, shade.emit, play.frame);
  const lamps = [...level.lamps, ...lanterns(level.world, level.checkpoints, play.lit)];
  gl.render(shade.color, shade.emit, lamps, { ...look, depth: look.depth * 0.55 }, view());

  const home = Math.round(play.home() * 100);
  best = Math.max(best, home);
  hud.textContent =
    `${scenario!.title}\n` +
    (p ? `Bob ${Math.round((bob.count / bob.total) * 100)}%\n` : `Bob is gone. Back at the ${play.checkpoint < 0 ? "start" : "checkpoint"} in a moment.\n`) +
    `${play.seconds().toFixed(1)} s` + (best ? ` · home ${home}% (best ${best}%)` : "");
  note.textContent = p ? level.note(p.cx) : "";
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
