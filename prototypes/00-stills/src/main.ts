import { PALETTES } from "./kit/bob.ts";
import { Renderer, type View } from "./kit/render.ts";
import type { SceneDef } from "./scene.ts";
import { SCENES } from "./scenes/index.ts";

const form = document.querySelector<HTMLFormElement>("#controls")!;
const grid = document.querySelector<HTMLElement>("#grid")!;
const params = new URLSearchParams(location.search);

const bobSel = form.elements.namedItem("bob") as HTMLSelectElement;
for (const [id, p] of Object.entries(PALETTES)) bobSel.add(new Option(p.name, id));
for (const name of ["bob", "zoom", "view", "seed"]) {
  const v = params.get(name);
  if (v !== null) (form.elements.namedItem(name) as HTMLInputElement).value = v;
}
if (params.get("animate") === "0") (form.elements.namedItem("animate") as HTMLInputElement).checked = false;

const opt = () => {
  const f = new FormData(form);
  return {
    bob: String(f.get("bob") ?? "coral"),
    zoom: Number(f.get("zoom") ?? 1.5),
    view: String(f.get("view") ?? "final") as View,
    animate: f.get("animate") === "on",
    seed: Math.max(1, Number(f.get("seed") ?? 7) | 0),
  };
};

interface Card { def: SceneDef; el: HTMLElement; canvas: HTMLCanvasElement; overlay: HTMLElement; img: ImageData; r?: Renderer; key?: string; visible: boolean; last: number }

const cards: Card[] = SCENES.map((def) => {
  const el = document.createElement("article");
  el.className = "card";
  el.id = def.id;
  el.innerHTML = `<div class="frame"><canvas width="${def.w}" height="${def.h}"></canvas><div class="overlay"></div><div class="loading">rendering…</div></div>
    <div class="meta"><h2>${def.title}<a href="#" class="png">save png</a></h2><p class="blurb">${def.blurb}</p><ul>${def.notes.map((n) => `<li>${n}</li>`).join("")}</ul></div>`;
  grid.append(el);
  const canvas = el.querySelector("canvas")!;
  const overlay = el.querySelector<HTMLElement>(".overlay")!;
  def.overlay?.(overlay);
  const card: Card = { def, el, canvas, overlay, img: new ImageData(def.w, def.h), visible: false, last: 0 };
  el.querySelector(".frame")!.addEventListener("click", () => {
    el.classList.toggle("big");
    if (el.classList.contains("big")) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  el.querySelector<HTMLAnchorElement>(".png")!.addEventListener("click", (e) => {
    const a = e.currentTarget as HTMLAnchorElement;
    a.download = `pixelbob-${def.id}.png`;
    a.href = canvas.toDataURL("image/png");
  });
  return card;
});

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const c = cards.find((c) => c.el === e.target);
    if (c) c.visible = e.isIntersecting;
  }
  pump();
});
for (const c of cards) io.observe(c.el);

function applyZoom(c: Card, zoom: number) {
  const z = c.def.fixedZoom ? 1 : zoom;
  const [fx, fy] = c.def.focus;
  const left = Math.max(0, Math.min(1 - 1 / z, fx - 0.5 / z));
  const top = Math.max(0, Math.min(1 - 1 / z, fy - 0.5 / z));
  const tf = `scale(${z}) translate(${-left * 100}%, ${-top * 100}%)`;
  c.canvas.style.transform = tf;
  c.overlay.style.transform = tf;
}

// Build renderers one at a time so the page stays responsive.
let building = false;
function pump() {
  if (building) return;
  const o = opt();
  const key = `${o.bob}|${o.seed}`;
  const next = cards.find((c) => c.visible && c.key !== key) ?? cards.find((c) => c.key !== key);
  if (!next) return;
  building = true;
  setTimeout(() => {
    const t0 = performance.now();
    next.r = new Renderer(next.def.build({ seed: o.seed, palette: PALETTES[o.bob] ?? PALETTES.coral }));
    next.key = key;
    next.el.querySelector(".loading")?.remove();
    draw(next, performance.now() / 1000);
    console.debug(`${next.def.id}: built in ${(performance.now() - t0).toFixed(0)} ms`);
    building = false;
    pump();
  }, 0);
}

function draw(c: Card, t: number) {
  if (!c.r) return;
  const o = opt();
  c.r.render(c.img, o.animate ? t : 2.5, o.view);
  c.canvas.getContext("2d")!.putImageData(c.img, 0, 0);
}

function loop(now: number) {
  const o = opt();
  if (o.animate)
    for (const c of cards)
      if (c.visible && c.r && now - c.last > 1000 / 30) {
        c.last = now;
        draw(c, now / 1000);
      }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

form.addEventListener("input", () => {
  const o = opt();
  for (const c of cards) applyZoom(c, o.zoom);
  const p = new URLSearchParams({ bob: o.bob, zoom: String(o.zoom), view: o.view, seed: String(o.seed), animate: o.animate ? "1" : "0" });
  history.replaceState(null, "", `?${p}${location.hash}`);
  pump();
  for (const c of cards) draw(c, performance.now() / 1000);
});
for (const c of cards) applyZoom(c, opt().zoom);
pump();
