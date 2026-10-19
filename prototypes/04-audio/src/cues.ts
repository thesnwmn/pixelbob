// What a scripted run along the course hears, section by section, and what hearing costs:
//   node src/cues.ts [frames]
// Rolls right, jumping (a full charge) at the course's jump marks, and pours into the pit.
import { COURSE_H, COURSE_W, DEFAULTS, buildCourse, createBob, sectionAt } from "@pixelbob/bob";
import { World } from "@pixelbob/sim";
import { Listener } from "./listen.ts";

const frames = Number(process.argv[2]) || 3600;
const world = new World(COURSE_W, COURSE_H, 7);
const course = buildCourse(world, 7);
const bob = createBob({ ...DEFAULTS }, 7);
bob.spawn(world, course.spawn.x, course.spawn.y, 20, course.bits);
const ear = new Listener();
ear.reset(bob);

type Tally = { frames: number; roll: number; wobble: number; wet: number; sizzle: number; impacts: number; jumps: number; splashes: number; tears: number };
const by = new Map<string, Tally>();
let ms = 0, charging = -1;
const jumps = [...course.marks.jumps];
for (let f = 0; f < frames; f++) {
  const p = bob.main;
  if (!p) break;
  if (charging < 0 && jumps.length && p.cx > jumps[0] - 30) { jumps.shift(); charging = 0; }
  const jump = charging >= 0 && charging < 22;
  if (charging >= 0 && ++charging > 30) charging = -1;
  world.step();
  bob.step(world, { move: 1, jump });
  const t0 = performance.now();
  const c = ear.hear(bob, world);
  ms += performance.now() - t0;
  const name = bob.main ? (sectionAt(course, bob.main.cx)?.name ?? "?") : "gone";
  const s = by.get(name) ?? { frames: 0, roll: 0, wobble: 0, wet: 0, sizzle: 0, impacts: 0, jumps: 0, splashes: 0, tears: 0 };
  s.frames++; s.roll += c.roll; s.wobble += c.wobble; s.wet += c.wet; s.sizzle += c.sizzle;
  if (c.impact) s.impacts++; if (c.jump) s.jumps++; if (c.splash) s.splashes++; if (c.tear) s.tears++;
  by.set(name, s);
}
const r = (v: number, n: number) => (v / n).toFixed(2);
for (const [name, s] of by) console.log(`${name.padEnd(16)} ${String(s.frames).padStart(5)} frames · roll ${r(s.roll, s.frames)} wobble ${r(s.wobble, s.frames)} wet ${r(s.wet, s.frames)} sizzle ${r(s.sizzle, s.frames)} · ${s.impacts} impacts, ${s.jumps} jumps, ${s.splashes} splashes, ${s.tears} tears`);
console.log(`hearing: ${(ms / frames * 1000).toFixed(0)} µs a frame on average`);
