import { PALETTES, type BobPalette } from "@pixelbob/00-stills/goo";
import { MAT } from "@pixelbob/00-stills/kit/materials.ts";
import { Renderer, type Setup } from "@pixelbob/00-stills/render";
import { SCENES } from "@pixelbob/00-stills/scenes";
import { LOGO_H, LOGO_W, buildLogo } from "./logo.ts";

// ---- Live shots: every canvas on the page is drawn by the stills renderer, lazily. ----

const DEFAULT_BOB = "rose";
let bobId = (() => { try { return localStorage.getItem("pixelbob-bob") ?? DEFAULT_BOB; } catch { return DEFAULT_BOB; } })();
if (!PALETTES[bobId]) bobId = DEFAULT_BOB;

interface Source { w: number; h: number; build(palette: BobPalette): Setup }
const SOURCES: Record<string, Source> = { logo: { w: LOGO_W, h: LOGO_H, build: (p) => buildLogo(7, p) } };
for (const s of SCENES) SOURCES[s.id] = { w: s.w, h: s.h, build: (p) => s.build({ seed: 7, palette: p }) };

interface Live { id: string; canvas: HTMLCanvasElement; img: ImageData; visible: boolean; last: number }
const lives: Live[] = [];
const renderers = new Map<string, Renderer>();

function mount(el: HTMLElement) {
  const id = el.dataset.scene!, src = SOURCES[id];
  if (!src) return;
  const canvas = document.createElement("canvas");
  canvas.width = src.w; canvas.height = src.h;
  el.append(canvas);
  el.style.aspectRatio = `${src.w} / ${src.h}`;
  const live: Live = { id, canvas, img: new ImageData(src.w, src.h), visible: false, last: 0 };
  lives.push(live);
  io.observe(el);
  (el as HTMLElement & { live?: Live }).live = live;
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const live = (e.target as HTMLElement & { live?: Live }).live;
    if (live) live.visible = e.isIntersecting;
  }
  pump();
}, { rootMargin: "200px" });

// Build one renderer at a time (posing Bob takes a moment) so the page stays responsive.
let building = false;
function pump() {
  if (building) return;
  const want = lives.find((l) => l.visible && !renderers.has(l.id)) ?? lives.find((l) => !renderers.has(l.id));
  if (!want) return;
  building = true;
  setTimeout(() => {
    renderers.set(want.id, new Renderer(SOURCES[want.id].build(PALETTES[bobId])));
    for (const l of lives) if (l.id === want.id) draw(l, performance.now() / 1000);
    building = false;
    pump();
  }, 0);
}

function draw(l: Live, t: number) {
  const r = renderers.get(l.id);
  if (!r) return;
  r.render(l.img, t);
  l.canvas.getContext("2d")!.putImageData(l.img, 0, 0);
  l.canvas.classList.add("ready");
}

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function loop(now: number) {
  if (!still)
    for (const l of lives)
      if (l.visible && now - l.last > 1000 / 15) { l.last = now; draw(l, now / 1000); }
  requestAnimationFrame(loop);
}

// ---- Worlds ----

const hex = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
const swatch = (name: keyof typeof MAT) => hex(MAT[name].ramp[Math.floor(MAT[name].ramp.length / 2)]);

interface World { id?: string; n: number; name: string; teaches: string; mats: [string, string][]; light: [string, string, string]; puzzle: string }
const WORLDS: World[] = [
  { id: "green", n: 1, name: "The Green", teaches: "Roll, jump, squash, momentum; lost bits; green moss grips", mats: [["grass", swatch("grass")], ["dirt", swatch("dirt")], ["sand", swatch("sand")], ["water", swatch("water")], ["moss", swatch("moss")]], light: ["#ffcf8a", "#7a8cc8", "low sun vs cool sky"], puzzle: "Build speed down the hill to make the moss ramp, and fetch the lost bit from the ledge above the pond." },
  { id: "caverns", n: 2, name: "Glow Caverns", teaches: "Runny Bob: pour, squeeze, dangle, drip; light as a resource", mats: [["stone", swatch("stone")], ["glow goo", swatch("goo")], ["mushrooms", "#3ff0d8"], ["crystal", swatch("crystal")]], light: ["#3ff0d8", "#a36bff", "teal glow vs violet crystal"], puzzle: "Melt at the hot spring, then lower yourself on a thread to the lost bit below. Too far and the thread snaps." },
  { id: "ruins", n: 3, name: "Sticky Ruins", teaches: "Climbing tacky walls; choosing a route by colour; crumbs", mats: [["moss", swatch("moss")], ["resin", swatch("resin")], ["gum", swatch("gum")], ["wood", swatch("wood")]], light: ["#c8e070", "#ff9a30", "green canopy vs amber resin"], puzzle: "Gum holds you on a sheer wall if you push in. Climb to the bit on top, and lose as few crumbs as you can." },
  { id: "grotto", n: 4, name: "Frozen Grotto", teaches: "Cold Bob: rigid, brittle, slides; freezing water into bridges", mats: [["ice", swatch("ice")], ["snow", swatch("snow")], ["water", swatch("water")], ["fire", "#ff9a30"]], light: ["#8fb4ff", "#ff9a40", "moonlight vs firelight"], puzzle: "Frozen, you can't jump, but you freeze the water you touch. Make a road across the lake to the fire." },
  { id: "foundry", n: 5, name: "The Foundry", teaches: "Splitting on purpose; plates, gates and machines", mats: [["steel", swatch("steel")], ["rust", swatch("rust")], ["molten", swatch("molten")], ["spikes", swatch("spikes")]], light: ["#ff8a2a", "#7fb8ff", "orange pour vs blue work lamps"], puzzle: "Leave a piece of yourself on the plate to hold the gate, pour the rest through, then come back for it." },
  { id: "sump", n: 6, name: "The Sump", teaches: "Absorbing: swell with water, glow with goo; oil, tar and gas", mats: [["mud", "#4a3524"], ["oil", swatch("oil")], ["toxic gas", swatch("toxic")], ["tar", "#16121a"]], light: ["#7cff5a", "#ff8a30", "toxic green vs methane flame"], puzzle: "Soak up water until you're heavy enough to tip the see-saw and lift the lost bit to the ledge." },
  { n: 7, name: "The Core", teaches: "Everything at once, against the heat", mats: [["lava", swatch("lava")], ["obsidian", "#1a1620"], ["everything", "#888"]], light: ["#ff4a14", "#ffe0a0", "lava red vs the last daylight"], puzzle: "The finale: melt, freeze, climb, split and swell your way back up and out. Not shot yet." },
];

function worlds() {
  const list = document.getElementById("worldlist")!;
  for (const w of WORLDS) {
    const el = document.createElement("article");
    el.className = "world";
    el.innerHTML = `${w.id ? `<div class="live" data-scene="${w.id}"></div>` : `<div class="noshot"><span>${w.name}</span><small>not shot yet</small></div>`}
      <div class="meta">
        <h3><span class="n">${w.n}</span>${w.name}</h3>
        <p class="teaches">${w.teaches}</p>
        <p>${w.puzzle}</p>
        <div class="chips">${w.mats.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>
        <div class="lightstory"><i style="background:${w.light[0]}"></i><i style="background:${w.light[1]}"></i>${w.light[2]}</div>
      </div>`;
    list.append(el);
    if (w.id) mount(el.querySelector<HTMLElement>(".live")!);
  }
  // The map: a slice through the earth, worlds deeper as you go.
  const map = document.getElementById("map")!;
  const bands = ["#5d7e3c", "#2c3a44", "#3f4a2a", "#3a5470", "#4a3a34", "#2c3424", "#5a1e10"];
  map.innerHTML = `<div class="sky"></div>${WORLDS.map((w, i) => `<div class="band" style="--c:${bands[i]}"><span class="node${i === 2 ? " here" : ""}${i > 2 ? " locked" : ""}" style="--x:${[18, 62, 30, 72, 40, 66, 50][i]}%">${w.n}</span><em>${w.name}</em></div>`).join("")}`;
}

// ---- Colour language and Bob's colour ----

function language() {
  const rows: [string, string, string][] = [
    [swatch("moss"), "Green moss", "Grippy ground: rolls up slopes too steep for rock"],
    [swatch("resin"), "Amber resin", "Holds you if you push in"],
    [swatch("gum"), "Violet gum", "Holds you on a sheer wall"],
    [swatch("ice"), "Pale blue", "Ice: no grip, and cold"],
    [swatch("lava"), "Orange, red, yellow", "Heat: lava, fire, molten metal. Danger, and how you melt"],
    [swatch("spikes"), "Steel teeth", "Spikes: they cut you"],
    [swatch("goo"), "Teal glow", "Light, and glow goo"],
    [swatch("toxic"), "Toxic green", "Gas and acid: it hurts"],
  ];
  document.getElementById("language")!.innerHTML = rows.map(([c, n, d]) => `<div><i style="background:${c}"></i><b>${n}</b><span>${d}</span></div>`).join("");
}

function bobColour() {
  const el = document.getElementById("bobcolour")!;
  const rgb = (c: number[]) => `rgb(${c.join(",")})`;
  el.innerHTML = `<p class="decision" id="decision"></p><div class="pals">${Object.entries(PALETTES).map(([id, p]) => `<button data-id="${id}"><span>${[p.rim, p.dark, p.body, p.light].map((c) => `<i style="background:${rgb(c)}"></i>`).join("")}</span>${p.name}</button>`).join("")}</div>`;
  el.querySelector("#decision")!.textContent = DECISION;
  for (const b of el.querySelectorAll<HTMLButtonElement>("button")) b.onclick = () => setBob(b.dataset.id!);
  const pick = document.getElementById("bobpick") as HTMLSelectElement;
  for (const [id, p] of Object.entries(PALETTES)) pick.add(new Option(p.name + (id === DEFAULT_BOB ? " (default)" : ""), id));
  pick.onchange = () => setBob(pick.value);
}

const DECISION = "Rose pink is the default. Pink is the one hue the worlds don't use: nature here is green, brown and blue, light is teal and amber, hazards are orange, red and toxic green. Rose sits between coral (too close to fire and lava) and bubblegum (too close to violet gum and crystals). Try the others: each one vanishes somewhere.";

function setBob(id: string) {
  bobId = id;
  try { localStorage.setItem("pixelbob-bob", id); } catch { /* private mode: fine */ }
  renderers.clear();
  for (const b of document.querySelectorAll<HTMLButtonElement>("#bobcolour button")) b.classList.toggle("on", b.dataset.id === id);
  (document.getElementById("bobpick") as HTMLSelectElement).value = id;
  const p = PALETTES[id];
  document.documentElement.style.setProperty("--bob", `rgb(${p.body.join(",")})`);
  pump();
}

worlds();
language();
bobColour();
for (const el of document.querySelectorAll<HTMLElement>(".live")) if (!(el as HTMLElement & { live?: Live }).live) mount(el);
setBob(bobId);
requestAnimationFrame(loop);
