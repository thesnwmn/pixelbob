// Plays the route the search bot found (src/route.txt, made by src/search.ts) in the game's
// renderer, so the producer can watch it: the bot's run through Bob's test course.
import { BobPainter } from "@pixelbob/bob";
import { GLRenderer, LOOKS, Shade } from "@pixelbob/render";
import { Play, STEP } from "../../../game/src/play.ts";
import { decode } from "../../../game/src/replay.ts";
import { parseScenario } from "../../../game/src/scenario.ts";
import shellJson from "../../../game/scenarios/shell.json";
import routeText from "./route.txt?raw";

const scenario = parseScenario("shell", shellJson).scenario!;
const route = decode(routeText).replay!;
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hud = document.querySelector<HTMLElement>("#hud")!;
let play = new Play(scenario);
const gl = new GLRenderer(canvas, play.level.world.w, play.level.world.h);
const painter = new BobPainter();
let shade = new Shade(play.level.world, scenario.seed);
const look = LOOKS.day;

function resize() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

let last = performance.now(), acc = 0, cx = play.start().x;
function tick(now: number) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    acc -= STEP;
    if (play.frame < route.frames.length) play.step(route.frames[play.frame]);
    else if (play.frame > route.frames.length + 120) {
      play = new Play(scenario);
      shade = new Shade(play.level.world, scenario.seed);
    } else play.step({ move: 0, jump: false });
  }
  const p = play.bob.main, { w: W, h: H } = play.level.world;
  if (p) cx += (p.cx + 25 - cx) * 0.3;
  const aspect = canvas.width / Math.max(1, canvas.height);
  let h = Math.min(H, 110), w = h * aspect;
  if (w > W) { w = W; h = w / aspect; }
  const y = p ? p.cy : H / 2;
  shade.update(play.frame);
  painter.draw(play.bob.view(), play.level.world, shade.color, shade.emit, play.frame);
  gl.render(shade.color, shade.emit, play.level.lamps, { ...look, depth: look.depth * 0.55 }, { x0: Math.max(0, Math.min(W - w, cx - w / 2)), y0: Math.max(0, Math.min(H - h, y - h / 2)), w, h });
  hud.textContent =
    `The search bot's route through Bob's test course: found in about 3 minutes of search in Node.\n` +
    `${(play.frame * STEP).toFixed(1)} s` + (play.finishedAt ? ` · finished at ${(play.finishedAt * STEP).toFixed(1)} s (the producer took 33 s)` : "") + " · loops";
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
