import { CAT, CONDUCT, Cat, DENSITY, FRICTION, M, MOBILITY, SHARP, type World } from "@pixelbob/sim";
import type { BobModel, BobView, Input, Losses, ModelKind, Piece } from "./model.ts";
import { DEFAULTS, frozenness, muscleAt, runniness, type Tweaks } from "./tweaks.ts";

export const DT = 1 / 60;
/** Bob is a little denser than water: he sinks slowly and floats on brine, mud and lava. */
const BOB_DENSITY = 10.5;
/** Max links per particle. */
export const NB = 10;
/** Max movement per substep, so particles can't tunnel through a cell. */
const MAXD = 0.9;
const EPS = 0.001;
const VMAX = 450;
/** Fastest a particle may move relative to its piece. */
const RELMAX = 120;
/** °C per step a struggling Bob warms himself by, below room temperature. */
const SHIVER = 0.02;
/** °C a jolt of effort (a change of direction, a tap of jump) warms a cold Bob by. */
const JOLT = 0.5;
/** Struggling only warms him this far: enough to move a little, not to thaw properly. */
const STRUGGLE_MAX = 0;
/** His normal temperature, and the one his radiant target is measured from. */
const AMBIENT_BOB = 20;
/** How far heat and cold shine from strong sources, px; and how fast he soaks it up at full exposure. */
const RADIANT = 24;
const SOAK = 0.03;
/** How strongly hot and cold sources shine (exposure per source cell at 1 px).  */
const HEAT_REACH = 1.8;
const COLD_REACH = 0.1;
/** Share of the temperature gap he hands to a cell he touches each step. */
const EMIT = 0.03;
const EMIT_MAX = 1.5;
/** Push downward when a runny Bob presses down, px/s². */
const POUR = 900;
/** Jumping out of liquid is weaker than off the ground: falling in is a trap, but one you can climb out of. */
const WATER_JUMP = 0.6;

const STATIC = Cat.Static, POWDER = Cat.Powder, LIQUID = Cat.Liquid;

/**
 * What every particle Bob shares, whatever holds his particles together: the particles
 * themselves (one per pixel of him), links between them (bonds or springs, which decide
 * what counts as one piece), moving through the world (collisions, friction, water), the
 * controller (rolling, jumping, squashing, pouring), hard hits, heat, and bookkeeping.
 *
 * A model (Lattice, Goo) supplies the forces inside him: `solve()` runs every substep, and
 * the other hooks let it react to freezing, melting, sticking and pieces changing.
 *
 * Fixed step of 1/60 s split into substeps; deterministic (no Math.random).
 */
export abstract class Body implements BobModel {
  abstract readonly kind: ModelKind;
  tweaks: Tweaks;
  fixedTemp: number | null = null;
  /** Substeps per step. */
  readonly sub: number;
  readonly h: number;

  cap = 0;
  x = new Float32Array(0); y = new Float32Array(0);
  px = new Float32Array(0); py = new Float32Array(0);
  vx = new Float32Array(0); vy = new Float32Array(0);
  /** Temperature, °C. */
  t = new Float32Array(0);
  alive = new Uint8Array(0);
  piece = new Int32Array(0);
  deg = new Uint8Array(0);
  /** Seconds before a torn particle may link again. */
  cool = new Float32Array(0);
  /** Contacts this step: summed normal, hardest impact speed, material and cell touched. */
  cnx = new Float32Array(0); cny = new Float32Array(0);
  hit = new Float32Array(0);
  cmat = new Uint8Array(0);
  ccell = new Int32Array(0);
  protected fz = new Float32Array(0);
  protected rn = new Float32Array(0);
  /** Share of a jelly's wobble (motion apart from moving and turning as one) taken out each step. */
  protected settleRate = 0;
  /** How hard pressing down pours a runny Bob (x POUR). */
  protected pourGain = 1;
  /** How hard his rolling effort turns him (models differ in how well spin becomes travel). */
  protected rollGain = 1;
  /** How much flatter runny Bob wants to be (his sag when fully runny, on top of a dome's). */
  protected sagRunny = 1.4;
  /** How much faster than the rest of his piece a runny particle may move (x RELMAX). */
  protected relRunny = 4;
  /** Speed the underside of each particle runs at against floors and ceilings (crawling). */
  protected tread = new Float32Array(0);
  /** Shift from pushing apart overlapping pieces this substep, which mustn't become velocity. */
  protected fsx = new Float32Array(0);
  protected fsy = new Float32Array(0);

  /** Links between particles: ends, current rest length, natural length. */
  ba = new Int32Array(0); bb = new Int32Array(0);
  bl = new Float32Array(0);
  bn = new Float32Array(0);
  nb = 0;

  order = new Int32Array(0);
  pieces: Piece[] = [];
  count = 0;
  total = 0;
  losses: Losses = { boiled: 0, dissolved: 0, crushed: 0, fell: 0 };
  /** Debug counters. */
  breaks = { strain: 0, impact: 0, merge: 0 };

  /** Controller state for the main piece. */
  charge = 0;
  stretch = 0;
  coyote = 0;
  facing = 1;
  protected held = false;
  /** Jump released this long ago and not yet used (fires on landing), with the charge it had. */
  protected buffer = 0;
  protected banked = 0;
  /** The player is asking for something: he shivers, which warms him a little. */
  protected effort = false;
  /** How hard he's pouring himself down this step (0..1). */
  protected pouring = 0;
  /** Direction changes and jump taps since the last step (shaking himself warm), and the last input. */
  protected jolts = 0;
  protected lastDir = 0;
  protected lastJump = false;
  /** Squash of the main piece's target shape (world frame), sx * sy = 1. */
  sx = 1;
  sy = 1;
  protected sag = 0;
  /** What the player asked for this step. */
  protected input: Input = { move: 0, jump: false };
  /** How hard the player presses down (0..1), for models that squash. */
  protected squeeze = 0;

  protected seed = 1;
  protected dirty = false;
  protected head = new Int32Array(0);
  protected next = new Int32Array(0);
  protected ww = 0;
  protected world: World | null = null;
  private src: number[] = [];
  /** Position handed back by stick(). */
  protected qx = 0;
  protected qy = 0;

  constructor(tweaks: Tweaks = DEFAULTS, seed = 1, sub = 10) {
    this.tweaks = { ...tweaks };
    this.seed = seed >>> 0 || 1;
    this.sub = sub;
    this.h = DT / sub;
  }

  rand(): number {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  // ---- Hooks for the model ----

  /** Make the model's own per-particle arrays. */
  protected abstract alloc(cap: number): void;
  /** Once per step per particle, before the controller (fz and rn are set). */
  protected prepare(_i: number, _T: number): void {}
  /** Forces inside him, once per substep, after the free move and before collisions. */
  protected abstract solve(substep: number): void;
  /** The main piece's temperature state, once per step (freezing rigid, melting...). */
  protected phase(_p: Piece, _T: number): void {}
  /** The main piece's shape is set (frozen) and can't be squashed. */
  protected rigidMain(): boolean { return false; }
  /** He jumped. */
  protected jumped(_p: Piece): void {}
  /** A particle touching (or near) a surface after collisions: set qx, qy (default: stays). */
  protected stick(_world: World, i: number, nx: number, ny: number): void { this.qx = nx; this.qy = ny; void i; }
  /** A piece is new or has changed members (members still carry their old piece index). */
  protected changed(_members: number[], _pi: number): void {}
  /** Every substep, after velocities are worked out from the moves (viscosity). */
  protected settle(): void {}
  /** After heat, before pieces are regrouped: links may form. */
  protected merge(): void {}
  /** After pieces are regrouped. */
  protected relax(): void {}

  /** Make a fresh round Bob centred at (cx, cy), plus any stranded bits of him placed around the level. */
  spawn(world: World, cx: number, cy: number, temp = 20, bits: { x: number; y: number; r: number }[] = []): void {
    // [offset x, offset y, disc index] for every particle; disc 0 is Bob.
    const discs = [{ x: cx, y: cy, r: this.tweaks.size }, ...bits];
    const pts: [number, number, number][] = [];
    discs.forEach(({ r }, d) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r * 0.5) pts.push([dx, dy, d]);
    });
    const n = pts.length;
    this.allocate(world, n * 2);
    const index = new Map<number, number>();
    const key = (dx: number, dy: number, d: number) => ((d * 256 + dy + 64) * 256) + dx + 64;
    pts.forEach(([dx, dy, d], i) => {
      this.x[i] = this.px[i] = Math.round(discs[d].x) + dx + 0.5;
      this.y[i] = this.py[i] = Math.round(discs[d].y) + dy + 0.5;
      this.spawned(i, dx, dy);
      this.t[i] = temp;
      this.alive[i] = 1;
      index.set(key(dx, dy, d), i);
    });
    pts.forEach(([dx, dy, d], i) => {
      for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const j = index.get(key(dx + ox, dy + oy, d));
        if (j !== undefined) this.bond(i, j, Math.hypot(ox, oy));
      }
    });
    this.count = this.total = n;
    this.started();
  }

  /** Fresh arrays for `cap` particles, and the controller back to rest. */
  protected allocate(world: World, cap: number): void {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.px = f(); this.py = f(); this.vx = f(); this.vy = f(); this.t = f(); this.cool = f();
    this.cnx = f(); this.cny = f(); this.hit = f(); this.fz = f(); this.rn = f(); this.tread = f(); this.fsx = f(); this.fsy = f();
    this.alive = new Uint8Array(cap); this.piece = new Int32Array(cap); this.deg = new Uint8Array(cap);
    this.cmat = new Uint8Array(cap); this.ccell = new Int32Array(cap);
    this.ba = new Int32Array(cap * NB / 2); this.bb = new Int32Array(cap * NB / 2); this.bl = new Float32Array(cap * NB / 2); this.bn = new Float32Array(cap * NB / 2);
    this.nb = 0;
    this.order = new Int32Array(cap);
    this.ww = world.w;
    this.world = world;
    this.head = new Int32Array(world.w * world.h).fill(-1);
    this.next = new Int32Array(cap);
    this.alloc(cap);
  }

  /** Particles placed: reset the controller and group them into pieces. */
  protected started(): void {
    this.losses = { boiled: 0, dissolved: 0, crushed: 0, fell: 0 };
    this.charge = this.stretch = this.coyote = this.sag = this.buffer = this.banked = 0;
    this.reset();
    this.sx = this.sy = 1;
    this.held = false;
    this.rebuild(true);
  }

  /** How much of him a group of particles is (which piece is the biggest, and so the main one). */
  protected weigh(members: number[]): number { return members.length; }
  /** A particle was placed at (dx, dy) from the middle of its disc. */
  protected spawned(_i: number, _dx: number, _dy: number): void {}
  /** Clear the model's state on spawn. */
  protected reset(): void {}

  protected bond(a: number, b: number, len: number): void {
    if (this.nb >= this.ba.length || this.deg[a] >= NB || this.deg[b] >= NB) return;
    this.ba[this.nb] = a; this.bb[this.nb] = b; this.bl[this.nb] = this.bn[this.nb] = len;
    this.nb++;
    this.deg[a]++; this.deg[b]++;
  }

  protected unbond(k: number): void {
    this.deg[this.ba[k]]--; this.deg[this.bb[k]]--;
    const l = --this.nb;
    this.ba[k] = this.ba[l]; this.bb[k] = this.bb[l]; this.bl[k] = this.bl[l]; this.bn[k] = this.bn[l];
    this.dirty = true;
  }

  /** Break every link of particle i. */
  protected tear(i: number): void {
    for (let k = this.nb - 1; k >= 0; k--) if (this.ba[k] === i || this.bb[k] === i) this.unbond(k);
    this.cool[i] = 0.6;
  }

  /** Break the links of piece p that cross the segment through (ox, oy) along (dx, dy), half-length len. */
  protected cut(p: number, ox: number, oy: number, dx: number, dy: number, len: number): void {
    const { x, y, piece } = this;
    for (let k = this.nb - 1; k >= 0; k--) {
      const a = this.ba[k], b = this.bb[k];
      if (piece[a] !== p) continue;
      // Signed side of the line for each end; along-line distance of the midpoint.
      const sa = (x[a] - ox) * dy - (y[a] - oy) * dx, sb = (x[b] - ox) * dy - (y[b] - oy) * dx;
      if ((sa < 0) === (sb < 0)) continue;
      const along = ((x[a] + x[b]) / 2 - ox) * dx + ((y[a] + y[b]) / 2 - oy) * dy;
      if (Math.abs(along) > len) continue;
      this.unbond(k);
      this.cool[a] = this.cool[b] = 0.6;
    }
  }

  protected kill(i: number, why: keyof Losses): void {
    if (!this.alive[i]) return;
    this.tear(i);
    this.alive[i] = 0;
    this.count--;
    this.losses[why]++;
    this.dirty = true;
  }

  protected solid(world: World, cx: number, cy: number): boolean {
    if (cx < 0 || cx >= world.w || cy >= world.h) return true;
    if (cy < 0) return false;
    const c = CAT[world.mat[cy * world.w + cx]];
    return c === STATIC || c === POWDER;
  }

  get main(): Piece | undefined {
    return this.pieces[0];
  }

  view(): BobView {
    return this;
  }

  shift(dx: number, dy: number): void {
    for (let i = 0; i < this.cap; i++) { this.x[i] += dx; this.px[i] += dx; this.y[i] += dy; this.py[i] += dy; }
    this.stats();
  }

  step(world: World, input: Input): void {
    if (!this.count) return;
    this.world = world;
    const tw = this.tweaks, n = this.cap, H = this.h;
    const { x, y, px, py, vx, vy, t, alive, fz, rn, cnx, cny, hit, cmat, ccell, cool, fsx, fsy } = this;

    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const T = this.fixedTemp ?? t[i];
      fz[i] = frozenness(T); rn[i] = runniness(T);
      this.prepare(i, T);
      if (cool[i] > 0) cool[i] -= DT;
      // Something solid landed on this particle (sand, a brush stroke): step out, or be crushed.
      const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
      if (cy >= world.h + 2) { this.kill(i, "fell"); continue; }
      if (this.solid(world, cx, cy)) {
        let free = false;
        search: for (let r = 1; r <= 2; r++)
          for (const [ox, oy] of [[0, -r], [-r, 0], [r, 0], [-r, -r], [r, -r], [0, r]]) {
            if (!this.solid(world, cx + ox, cy + oy)) {
              x[i] = px[i] = cx + ox + 0.5; y[i] = py[i] = cy + oy + 0.5;
              free = true;
              break search;
            }
          }
        if (!free) this.kill(i, "crushed");
      }
    }
    if (!this.count) { this.rebuild(false); return; }

    // Contacts from the last step steer the controller, then start afresh.
    this.control(input);
    cnx.fill(0); cny.fill(0); hit.fill(0); cmat.fill(0); ccell.fill(-1);

    const g = tw.gravity;
    for (let s = 0; s < this.sub; s++) {
      // Forces and prediction.
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        let ax = 0, ay = g;
        const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
        if (world.inside(cx, cy)) {
          const m = world.mat[cy * world.w + cx];
          if (CAT[m] === LIQUID) {
            ay -= g * DENSITY[m] / BOB_DENSITY;
            const drag = Math.min(0.5, H * (10 + 40 * (1 - MOBILITY[m])));
            vx[i] *= 1 - drag; vy[i] *= 1 - drag;
          }
        }
        vx[i] += ax * H; vy[i] += ay * H;
        px[i] = x[i]; py[i] = y[i];
        let dx = vx[i] * H, dy = vy[i] * H;
        const d = Math.hypot(dx, dy);
        if (d > MAXD) { dx *= MAXD / d; dy *= MAXD / d; }
        x[i] += dx; y[i] += dy;
      }
      fsx.fill(0); fsy.fill(0);
      this.solve(s);
      this.collide(world);
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        vx[i] = (x[i] - px[i] - fsx[i]) / H; vy[i] = (y[i] - py[i] - fsy[i]) / H;
        // Safety net: no particle outruns a hard fall.
        const sp = vx[i] * vx[i] + vy[i] * vy[i];
        if (sp > VMAX * VMAX) { const k = VMAX / Math.sqrt(sp); vx[i] *= k; vy[i] *= k; }
      }
      this.settle();
    }

    this.impacts();
    this.damp();
    this.heat(world);
    this.merge();
    if (this.dirty) this.rebuild(false);
    this.relax();
    this.stats();
  }

  // ---- Controller: how Bob turns intent into deformation ----

  protected control(input: Input): void {
    this.input = input;
    const p = this.pieces[0];
    if (!p) return;
    const tw = this.tweaks, { vx, vy, x, y, order } = this;
    const T = this.fixedTemp ?? p.temp;
    const m = tw.muscle * muscleAt(T);
    const grounded = p.ground >= Math.max(1, p.radius * 0.35);
    const swim = p.wet > 0.3;
    this.coyote = grounded ? 0.15 : this.coyote - DT;
    const dir = Math.max(-1, Math.min(1, input.move));
    if (dir) this.facing = Math.sign(dir);
    this.effort = dir !== 0 || input.jump;
    // Struggling: every change of direction and every tap of jump is a jolt of effort.
    const d = Math.sign(dir);
    if ((d && d !== this.lastDir) || (input.jump && !this.lastJump)) this.jolts++;
    if (d) this.lastDir = d;
    this.lastJump = input.jump;

    this.phase(p, T);

    // Jump: hold to squash (that's him winding up, so it takes muscle), release to spring.
    // In water, holding paddles up and releasing leaps out. Released just before landing, it
    // still fires on touchdown.
    if (input.jump && m > 0.05) {
      this.charge = Math.min(1, this.charge + (DT / 0.35) * Math.min(1, m));
      this.held = true;
    } else if (!input.jump && this.held) {
      this.held = false;
      this.buffer = 0.15;
      this.banked = this.charge;
      this.charge = 0;
    }
    if (this.buffer > 0) {
      this.buffer -= DT;
      if ((this.coyote > 0 || p.wet > 0.1) && m > 0.05) {
        // Push off along the ground's normal, leaning up, with a little of the stick.
        let jx = p.nx * 0.45 + dir * 0.2, jy = p.ny * 0.45 - 0.55;
        if (this.coyote <= 0) { jx = dir * 0.25; jy = -1; }
        const jl = Math.hypot(jx, jy) || 1;
        jx /= jl; jy /= jl;
        // You can only push off what you're touching: perched on a point, jumps are weak.
        // Water gives a fair push too.
        const footing = this.coyote > 0 ? Math.sqrt(Math.min(1, p.ground / Math.max(1, p.radius * 0.6))) : 0;
        // Winding up needs ground to squash against, so a leap out of water gets no charge.
        const charge = this.coyote > 0 ? this.banked : 0;
        const speed = tw.jump * (0.55 + 0.45 * charge) * Math.min(1.4, m) * Math.max(footing, p.wet > 0.1 ? WATER_JUMP : 0);
        for (let k = p.start; k < p.start + p.len; k++) {
          const i = order[k];
          const into = vx[i] * jx + vy[i] * jy;
          if (into < 0) { vx[i] -= into * jx; vy[i] -= into * jy; }
          vx[i] += jx * speed; vy[i] += jy * speed;
        }
        this.stretch = 0.14;
        this.coyote = this.buffer = 0;
        this.jumped(p);
      }
    }
    if (!this.held) this.charge = 0;
    // He settles into a dome on the ground and rounds up in the air (world frame, so it doesn't roll with him).
    // Runny, he slumps much flatter: a puddle that can ooze under low gaps.
    this.sag += ((grounded ? 0.16 + this.sagRunny * runniness(T) : 0) - this.sag) * 0.15;
    // Holding down squashes him: a squat that lowers him under things. How much depends on how
    // pliable he is: a good squash when normal, a little when cold, none when frozen solid
    // (runny, he's already flat, and pours instead; see below).
    const squeeze = Math.max(0, Math.min(1, input.down ?? 0)) * Math.min(1, m) * (1 - frozenness(T));
    this.squeeze = squeeze;
    const sq = (1 + this.sag) * (1 + 0.35 * this.charge * Math.min(1, m)) * (1 + 0.5 * squeeze);
    this.sx = this.rigidMain() ? 1 : this.stretch > 0 ? 0.84 : sq;
    this.sy = 1 / this.sx;
    if (this.stretch > 0) this.stretch -= DT;

    // Runny Bob can't hold a shape to roll with, so he oozes (crawls) instead.
    const ooze = tw.drive === "crawl" ? 1 : runniness(T);
    if (ooze < 1) {
      // Turn like a tread: torque about his centre. Friction at the bottom turns spin into travel.
      let num = 0, den = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - p.cx, oy = y[i] - p.cy;
        num += ox * vy[i] - oy * vx[i]; den += ox * ox + oy * oy;
      }
      const w = den > 0 ? num / den : 0;
      const target = (dir * tw.speed) / Math.max(2, p.radius);
      // Holding still, he grips and stops himself, gently: momentum carries.
      const accel = (dir ? 45 * this.rollGain : 8) * m * (1 - ooze) * (grounded ? 1 : dir ? tw.air * 0.5 : 0);
      const dw = Math.max(-accel * DT, Math.min(accel * DT, target - w));
      if (dw)
        for (let k = p.start; k < p.start + p.len; k++) {
          const i = order[k];
          vx[i] -= dw * (y[i] - p.cy); vy[i] += dw * (x[i] - p.cx);
        }
    }
    this.tread.fill(0);
    this.crawl(p, dir, ooze, m, grounded);
    // Steering in the air or water: weak, and only up to his top speed.
    if (dir && (!grounded || swim) && dir * p.vx < tw.speed) {
      const a = dir * (swim ? Math.max(tw.air, 0.4) : tw.air) * 500 * DT * Math.min(1, m + 0.2);
      for (let k = p.start; k < p.start + p.len; k++) vx[order[k]] += a;
    }
    // Pressing down while runny, he pours himself downward: into a pit, through a hole,
    // over an edge. Where there's floor below nothing happens; over a gap he drips in.
    const down = Math.max(0, Math.min(1, input.down ?? 0)) * ooze;
    this.pouring = down;
    // (Only the parts with nothing under them are pushed: the rest stays put on the floor,
    // while his links may stretch further than usual, so he drains into the gap.)
    const world = this.world;
    if (down > 0.05 && world)
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k];
        if (!this.solid(world, Math.floor(x[i]), Math.floor(y[i]) + 1)) vy[i] += POUR * this.pourGain * down * DT;
      }
    // Swimming up: holding jump in water paddles upward.
    if (swim && input.jump && m > 0.05)
      for (let k = p.start; k < p.start + p.len; k++) vy[order[k]] -= 520 * DT * Math.min(1, m);
  }

  /**
   * Crawl: his underside runs like a conveyor along whatever it touches. Friction does the
   * pushing, so this needs grip as much as rolling does (none on ice).
   */
  protected crawl(p: Piece, dir: number, ooze: number, m: number, _grounded: boolean): void {
    const tread = dir * this.tweaks.speed * 1.5 * ooze * Math.min(1, m);
    if (tread) for (let k = p.start; k < p.start + p.len; k++) this.tread[this.order[k]] = tread;
  }

  /** Point particles against solid cells, one axis at a time, with friction and a one-pixel step-up. */
  protected collide(world: World): void {
    const { x, y, px, py, vx, vy, alive, cnx, cny, hit, cmat, ccell } = this, n = this.cap;
    const grip = this.tweaks.grip, ww = world.w, H = this.h, SUB = this.sub;
    const mat = (cx: number, cy: number) => (world.inside(cx, cy) ? world.mat[cy * ww + cx] : M.rock);
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      let nx = x[i], ny = y[i];
      const ox = px[i], oy = py[i];
      const ocx = Math.floor(ox), ocy = Math.floor(oy);
      // Horizontal.
      let cx = Math.floor(nx);
      if (cx !== ocx && this.solid(world, cx, ocy)) {
        // A one-pixel ledge with room above: hop up onto it (smooth slopes are staircases).
        if (this.fz[i] < 0.5 && !this.solid(world, cx, ocy - 1) && !this.solid(world, ocx, ocy - 1)) {
          const lift = oy - (ocy - EPS);
          ny -= lift; py[i] -= lift;
        } else {
          const m = mat(cx, ocy);
          hit[i] = Math.max(hit[i], Math.abs(vx[i]));
          nx = nx > ox ? cx - EPS : cx + 1 + EPS;
          cnx[i] += nx > ox ? -1 : 1;
          cmat[i] = m; ccell[i] = ocy * ww + cx;
          // Wall friction slows sliding up or down it.
          const f = 1 - Math.pow(1 - Math.min(1, FRICTION[m] * grip), 1 / SUB);
          ny = oy + (ny - oy) * (1 - f * 0.5);
        }
      }
      cx = Math.floor(nx);
      const cy = Math.floor(ny), pcy = Math.floor(py[i]);
      // Vertical (py may have been lifted by a step-up).
      if (cy !== pcy && this.solid(world, cx, cy)) {
        const down = ny > py[i];
        const m = mat(cx, cy);
        hit[i] = Math.max(hit[i], Math.abs(vy[i]));
        ny = down ? cy - EPS : cy + 1 + EPS;
        cny[i] += down ? -1 : 1;
        cmat[i] = m; ccell[i] = cy * ww + cx;
        const f = 1 - Math.pow(1 - Math.min(1, FRICTION[m] * grip), 1 / SUB), tr = this.tread[i] * H;
        nx = px[i] + tr + (nx - px[i] - tr) * (1 - f);
      } else if (this.solid(world, cx, cy + 1) && ny > cy + 1 - 0.05) {
        // Resting on the floor: it still touches, for friction and for "grounded".
        const m = mat(cx, cy + 1);
        cny[i] -= 1;
        if (!cmat[i]) { cmat[i] = m; ccell[i] = (cy + 1) * ww + cx; }
        const f = 1 - Math.pow(1 - Math.min(1, FRICTION[m] * grip), 1 / SUB), tr = this.tread[i] * H;
        nx = px[i] + tr + (nx - px[i] - tr) * (1 - f);
      }
      this.stick(world, i, nx, ny);
      nx = this.qx; ny = this.qy;
      // Last resort: never end inside a solid.
      if (this.solid(world, Math.floor(nx), Math.floor(ny))) { nx = px[i]; ny = py[i]; }
      x[i] = nx; y[i] = ny;
    }
  }

  // ---- After the substeps ----

  /**
   * Internal damping: nudge each particle's velocity towards its piece's rigid motion
   * (shared velocity plus spin). Frozen Bob keeps no wobble, or every landing would ring
   * through the stiff body and bounce it off the ground. Also caps how fast particles move
   * relative to their piece.
   */
  protected damp(): void {
    const { x, y, vx, vy, order, fz } = this;
    for (const p of this.pieces) {
      if (p.len < 3) continue;
      let cx = 0, cy = 0, mvx = 0, mvy = 0, f = 0, r = 0;
      for (let k = p.start; k < p.start + p.len; k++) { const i = order[k]; cx += x[i]; cy += y[i]; mvx += vx[i]; mvy += vy[i]; f += fz[i]; r += this.rn[i]; }
      cx /= p.len; cy /= p.len; mvx /= p.len; mvy /= p.len; f /= p.len; r /= p.len;
      let num = 0, den = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - cx, oy = y[i] - cy;
        num += ox * (vy[i] - mvy) - oy * (vx[i] - mvx); den += ox * ox + oy * oy;
      }
      if (f > 0.3) {
        let landed = false, mu = 0, touching = 0;
        for (let j = p.start; j < p.start + p.len; j++) {
          const i = order[j];
          if (this.cny[i] < 0) { landed = true; mu += FRICTION[this.cmat[i]]; touching++; }
        }
        // A frozen lump landing stays down: its stiffness would otherwise spring it back up.
        if (landed && p.vy > 30 && mvy < 0) {
          const dv = -mvy * Math.min(1, f * 1.2);
          for (let j = p.start; j < p.start + p.len; j++) vy[order[j]] += dv;
          mvy += dv;
        }
        // And it slides like a block on a slope. Pixel slopes are staircases, and collisions
        // only push straight up off each step, so a rigid lump never feels the slope by itself:
        // fit a line through the points it rests on and apply gravity down it, against
        // friction from its weight (not from how many of its particles happen to touch).
        if (touching) {
          const slope = this.slopeUnder(cx, cy, p.radius);
          const len = Math.hypot(1, slope), tx = 1 / len, ty = slope / len;
          const g = this.tweaks.gravity, down = g * ty, grip = (mu / touching) * this.tweaks.grip * g * tx;
          const vt = mvx * tx + mvy * ty;
          // Gravity along the slope, then friction against the motion; held still if it can't overcome it.
          let nt = vt + down * DT * f;
          const drag = grip * DT * f;
          nt = Math.abs(nt) <= drag ? 0 : nt - Math.sign(nt) * drag;
          const dv = nt - vt;
          for (let j = p.start; j < p.start + p.len; j++) { vx[order[j]] += dv * tx; vy[order[j]] += dv * ty; }
          mvx += dv * tx; mvy += dv * ty;
        }
      }
      // Frozen Bob is damped (and jelly, a little, in some models); oozing is all internal motion.
      // (Some models damp a normal jelly's wobble too: settle says how much per step.)
      const w = den > 0 ? num / den : 0, k = Math.max(0.8 * f, this.settleRate * (1 - f) * (1 - r));
      for (let j = p.start; j < p.start + p.len; j++) {
        const i = order[j], ox = x[i] - cx, oy = y[i] - cy;
        const rx = mvx - w * oy, ry = mvy + w * ox;
        vx[i] += (rx - vx[i]) * k;
        vy[i] += (ry - vy[i]) * k;
        // No particle races about inside him: splashes stay soft, and the faces of a fresh
        // cut don't spray off when he lands.
        const dx = vx[i] - rx, dy = vy[i] - ry, d2 = dx * dx + dy * dy;
        const cap = RELMAX * (1 + this.relRunny * r);
        if (d2 > cap * cap) { const c = cap / Math.sqrt(d2); vx[i] = rx + dx * c; vy[i] = ry + dy * c; }
      }
    }
  }

  /** Hard hits tear him: sharp things slice, frozen Bob cracks, anything else splashes off droplets. */
  protected impacts(): void {
    const tw = this.tweaks, { hit, cmat, fz, alive, piece, x, y, cnx, cny } = this;
    let cracks = 0, slices = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!alive[i] || !hit[i]) continue;
      const sharp = SHARP[cmat[i]], f = fz[i];
      const limit = (140 + 520 * tw.cohesion) * (1 - 0.85 * sharp) * (1 - 0.7 * f);
      const p = this.pieces[piece[i]];
      // Judge a hit by how fast the whole piece was moving into the surface, not by one
      // particle's speed: particles jiggle (more so on a bumpy floor) even when he sits still.
      let speed = hit[i];
      if (p) {
        const l = Math.hypot(cnx[i], cny[i]) || 1;
        speed = Math.min(speed, Math.max(0, -(p.vx * cnx[i] + p.vy * cny[i]) / l));
      }
      if (speed < limit) continue;
      this.breaks.impact++;
      const r = p ? p.radius : 4;
      if (sharp > 0.5) {
        // A spike pokes in along the contact normal and slices him around it: a cut, not
        // shredding, so a few per step at most and not where it just cut.
        if (slices > 3 || this.cool[i] > 0) continue;
        // The cut runs from where it went in right through him.
        const l = Math.hypot(cnx[i], cny[i]) || 1, dx = cnx[i] / l, dy = cny[i] / l;
        this.cut(piece[i], x[i] + dx * r, y[i] + dy * r, dx, dy, r * 1.3);
        // The cut stays open for a while (bits left on spikes are bits lost, until he goes back for them).
        if (p) for (let k = p.start; k < p.start + p.len; k++) if (Math.abs(this.x[this.order[k]] - x[i]) < 3) this.cool[this.order[k]] = 1.5;
        slices++;
      } else if (f > 0.5) {
        // Brittle: a crack runs right across him (one per piece per impact).
        if (cracks > 2 || this.cool[i] > 0) continue;
        // Radially, from where it hit towards his middle, a little off true.
        const a = (p ? Math.atan2(p.cy - y[i], p.cx - x[i]) : 0) + (this.rand() - 0.5) * 0.8, pi = piece[i];
        this.cut(pi, x[i], y[i], Math.cos(a), Math.sin(a), r * 2.5);
        if (p) for (let k = p.start; k < p.start + p.len; k++) this.cool[this.order[k]] = 0.25;
        cracks++;
      } else if (f <= 0.5) this.tear(i);
    }
  }

  /**
   * Slope of the ground under a piece (dy/dx, positive = downhill to the right), fitted
   * through the surface height of the columns either side of it, out to twice its radius,
   * so steps of a pixel staircase read as the slope they make.
   */
  protected slopeUnder(cx: number, cy: number, r: number): number {
    const world = this.world;
    if (!world) return 0;
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    const reach = Math.max(4, Math.round(r * 2)), y0 = Math.floor(cy);
    for (let x = Math.round(cx) - reach; x <= Math.round(cx) + reach; x++) {
      let y = y0;
      while (y < y0 + reach * 2 && !this.solid(world, x, y)) y++;
      if (y >= y0 + reach * 2 || y === y0) continue;
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const vxx = sxx - (sx * sx) / n;
    return n >= 4 && vxx > 0 ? Math.max(-1, Math.min(1, (sxy - (sx * sy) / n) / vxx)) : 0;
  }

  /**
   * Bob's temperature (docs/08-bob.md#temperature). Gameplay first, physics second:
   *   - Near a strong source (glowing lava, a mass of ice) he soaks up its heat or cold
   *     through the air over a couple of seconds, all the way through, more the closer he is.
   *   - Away from sources he drifts back towards the temperature around him slowly, so he
   *     holds a heat or a chill long enough to use it.
   *   - Touching something extreme (lava, fire) still acts fast; water cools him quicker than air.
   *   - He gives his temperature off to what he touches: hot Bob melts snow and ice, frozen
   *     Bob freezes water.
   * Then particles boil off above 100 °C, and acid eats them.
   */
  protected heat(world: World): void {
    const { t, alive, x, y, ccell, ba, bb, order } = this, ww = world.w;
    if (this.fixedTemp !== null) {
      for (let i = 0; i < this.cap; i++) if (alive[i]) t[i] = this.fixedTemp;
      this.jolts = 0;
    } else {
      const soak = this.tweaks.soak, hold = Math.max(0.1, this.tweaks.hold);
      for (const p of this.pieces) {
        // Hot and cold things shine on the particles facing them, so his near side heats (or
        // chills) first and it spreads through him.
        const src = this.sources(world, p);
        for (let k = p.start; k < p.start + p.len; k++) {
          const i = order[k];
          if (src.length) {
            let hot = 0, cold = 0;
            for (let j = 0; j < src.length; j += 3) {
              const dx = src[j] - x[i], dy = src[j + 1] - y[i], d2 = dx * dx + dy * dy;
              if (d2 > RADIANT * RADIANT) continue;
              // Falls off gently with distance (1/d, not 1/d²), so it carries across a room.
              const f = 1 / Math.max(1, Math.sqrt(d2));
              if (src[j + 2] > 0) hot += src[j + 2] * f;
              else cold -= src[j + 2] * f;
            }
            if (hot + cold > 0.001) {
              // Radiated heat alone tops out short of boiling; only touching something hot boils him.
              const target = AMBIENT_BOB + 72 * (1 - Math.exp(-hot)) - 45 * (1 - Math.exp(-cold));
              t[i] += (target - t[i]) * Math.min(0.1, SOAK * soak * (1 - Math.exp(-(hot + cold))));
            }
          }
          // Conduction with the cell he's in and the one he touches, faster the bigger the gap.
          const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
          if (world.inside(cx, cy)) this.conduct(world, i, cy * ww + cx, hold);
          if (ccell[i] >= 0) this.conduct(world, i, ccell[i], hold);
        }
      }
      // Trying to move in the cold, he shivers: a little body heat (only the main piece is
      // trying). Shaking back and forth and tapping jump warm him much more: enough to work a
      // frozen Bob loose a little at a time.
      const p = this.pieces[0];
      const warm = (this.effort ? SHIVER : 0) + this.jolts * JOLT;
      if (warm && p)
        for (let k = p.start; k < p.start + p.len; k++) { const i = order[k]; if (t[i] < STRUGGLE_MAX) t[i] = Math.min(STRUGGLE_MAX, t[i] + warm); }
      this.jolts = 0;
      // Heat spreads through him along his links.
      for (let k = 0; k < this.nb; k++) {
        const a = ba[k], b = bb[k], d = (t[b] - t[a]) * 0.12;
        t[a] += d; t[b] -= d;
      }
    }
    for (let i = 0; i < this.cap; i++) {
      if (!alive[i]) continue;
      const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
      const T = this.fixedTemp ?? t[i];
      if (T > 100 && this.rand() < Math.min(0.5, (T - 100) / 400)) {
        if (world.get(cx, cy) === M.air) world.set(cx, cy, M.steam);
        this.kill(i, "boiled");
      } else if (world.get(cx, cy) === M.acid && this.rand() < 0.15) {
        if (this.rand() < 0.3) world.set(cx, cy, M.air);
        this.kill(i, "dissolved");
      }
    }
  }

  /**
   * Strong hot and cold sources near a piece (cells hotter than 150 °C or colder than −5 °C
   * within reach), as [x, y, strength] triples; strength is positive for heat, negative for cold.
   */
  private sources(world: World, p: Piece): number[] {
    const out = this.src;
    out.length = 0;
    const reach = p.radius + RADIANT, x0 = Math.max(0, Math.floor(p.cx - reach)), x1 = Math.min(world.w - 1, Math.ceil(p.cx + reach));
    const y0 = Math.max(0, Math.floor(p.cy - reach)), y1 = Math.min(world.h - 1, Math.ceil(p.cy + reach));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const T = world.temp[cy * world.w + cx];
        if (T >= 150) out.push(cx + 0.5, cy + 0.5, ((T - 150) / 1000) * HEAT_REACH);
        else if (T <= -5) out.push(cx + 0.5, cy + 0.5, ((T + 5) / 20) * COLD_REACH);
      }
    return out;
  }

  /** Heat flow between particle i and cell c, both ways (he warms or chills what he touches). */
  private conduct(world: World, i: number, c: number, hold: number): void {
    const m = world.mat[c], gap = world.temp[c] - this.t[i];
    // Air barely moves his temperature (he holds a heat); liquids more (a dip cools him off);
    // solids a little; big gaps fast.
    const touch = CAT[m] === Cat.Liquid ? 0.15 : 0.002;
    const k = (m === M.air ? 0.0004 / hold : 0.0004 / hold + CONDUCT[m] * touch) * (1 + Math.abs(gap) / 150);
    this.t[i] += gap * Math.min(0.3, k);
    if (m !== M.air && CAT[m] !== Cat.Gas && Math.abs(gap) > 2) {
      // A little at a time: enough to melt snow or freeze water, not to put out lava.
      world.temp[c] -= Math.max(-EMIT_MAX, Math.min(EMIT_MAX, gap * EMIT));
      world.wake(c % world.w, (c / world.w) | 0);
    }
  }

  protected bonded(a: number, b: number): boolean {
    for (let k = 0; k < this.nb; k++) if ((this.ba[k] === a && this.bb[k] === b) || (this.ba[k] === b && this.bb[k] === a)) return true;
    return false;
  }

  /** Group particles into connected pieces (biggest first). Pieces that changed are handed to changed(). */
  protected rebuild(keepAll: boolean): void {
    this.dirty = false;
    const n = this.cap, { alive, ba, bb, piece } = this;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (i: number): number => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    };
    for (let k = 0; k < this.nb; k++) {
      const a = find(ba[k]), b = find(bb[k]);
      if (a !== b) parent[a] = b;
    }
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const r = find(i);
      let g = groups.get(r);
      if (!g) groups.set(r, (g = []));
      g.push(i);
    }
    const old = this.pieces;
    const list = [...groups.values()].sort((a, b) => this.weigh(b) - this.weigh(a) || a[0] - b[0]);
    this.pieces = [];
    let o = 0;
    for (const [pi, members] of list.entries()) {
      const prev = piece[members[0]];
      // Unchanged: same members, and still (or still not) the main piece.
      const same = keepAll || (old[prev] !== undefined && old[prev].len === members.length && (prev === 0) === (pi === 0) && members.every((i) => piece[i] === prev));
      const p: Piece = { start: o, len: members.length, cx: 0, cy: 0, vx: 0, vy: 0, temp: 20, radius: 1, ground: old[prev]?.ground ?? 0, nx: 0, ny: -1, wet: 0 };
      for (const i of members) this.order[o++] = i;
      if (!same) this.changed(members, pi);
      this.pieces.push(p);
    }
    this.pieces.forEach((p, pi) => { for (let k = p.start; k < p.start + p.len; k++) piece[this.order[k]] = pi; });
    this.stats();
  }

  protected stats(): void {
    const { x, y, vx, vy, t, order, cnx, cny, world } = this;
    for (const p of this.pieces) {
      let cx = 0, cy = 0, mvx = 0, mvy = 0, tt = 0, ground = 0, nx = 0, ny = 0, wet = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k];
        cx += x[i]; cy += y[i]; mvx += vx[i]; mvy += vy[i]; tt += t[i];
        if (cnx[i] || cny[i]) {
          if (cny[i] < 0) ground++;
          const l = Math.hypot(cnx[i], cny[i]);
          nx += cnx[i] / l; ny += cny[i] / l;
        }
        const qx = Math.floor(x[i]), qy = Math.floor(y[i]);
        if (world && world.inside(qx, qy) && CAT[world.mat[qy * world.w + qx]] === LIQUID) wet++;
      }
      const l = p.len;
      p.cx = cx / l; p.cy = cy / l; p.vx = mvx / l; p.vy = mvy / l; p.temp = this.fixedTemp ?? tt / l;
      let r2 = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - p.cx, oy = y[i] - p.cy;
        r2 += ox * ox + oy * oy;
      }
      p.radius = Math.sqrt((2 * r2) / l);
      p.ground = ground;
      const nl = Math.hypot(nx, ny);
      p.nx = nl ? nx / nl : 0; p.ny = nl ? ny / nl : -1;
      p.wet = wet / l;
    }
  }

  countIn(x0: number, y0: number, x1: number, y1: number): number {
    let c = 0;
    for (let i = 0; i < this.cap; i++) if (this.alive[i] && this.x[i] >= x0 && this.x[i] < x1 && this.y[i] >= y0 && this.y[i] < y1) c++;
    return c;
  }
}
