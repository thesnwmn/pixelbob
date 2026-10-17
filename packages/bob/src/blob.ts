import { CAT, CONDUCT, Cat, DENSITY, FRICTION, M, MOBILITY, SHARP, type World } from "@pixelbob/sim";
import { DEFAULTS, frozenness, muscleAt, runniness, type Tweaks } from "./tweaks.ts";

/** What the player is asking for this step. move is -1..1. */
export interface Input { move: number; jump: boolean }

/** A connected bit of Bob. pieces[0] is always the biggest: the one with the eyes. */
export interface Piece {
  /** Members are order[start .. start + len). */
  start: number;
  len: number;
  cx: number; cy: number;
  vx: number; vy: number;
  temp: number;
  /** Radius of the disc with the same spread. */
  radius: number;
  /** Particles touching ground below them this step. */
  ground: number;
  /** Average contact normal (points away from the surfaces he touches). */
  nx: number; ny: number;
  /** Fraction of members in a liquid. */
  wet: number;
}

const SUB = 10, DT = 1 / 60, H = DT / SUB;
/** Bob is a little denser than water: he sinks slowly and floats on brine, mud and lava. */
const BOB_DENSITY = 10.5;
/** Max bonds per particle. */
const NB = 10;
/** Particles closer than this push apart. */
const R0 = 0.85;
/** Max movement per substep, so particles can't tunnel through a cell. */
const MAXD = 0.9;
const EPS = 0.001;
const VMAX = 450;
/** Fastest a particle may move relative to its piece. */
const RELMAX = 120;
/** °C per step a struggling Bob warms himself by, below room temperature. */
const SHIVER = 0.15;
/** Jumping out of liquid is weaker than off the ground: falling in is a trap, but one you can climb out of. */
const WATER_JUMP = 0.6;

const STATIC = Cat.Static, POWDER = Cat.Powder, LIQUID = Cat.Liquid;

/**
 * Bob as particles (docs/03-simulation.md, docs/08-bob.md): one particle per
 * pixel of his body, joined to neighbours by bonds (XPBD distance
 * constraints that break when overstretched) and pulled towards a rest shape
 * by shape matching. He moves by deforming himself, so all his abilities
 * come from forces between his own particles and the ground.
 *
 * Fixed step of 1/60 s split into substeps; deterministic (no Math.random).
 */
export class Blob {
  tweaks: Tweaks;
  /** Fixed temperature for every particle, or null to exchange heat with the world. */
  fixedTemp: number | null = null;

  cap = 0;
  x = new Float32Array(0); y = new Float32Array(0);
  px = new Float32Array(0); py = new Float32Array(0);
  vx = new Float32Array(0); vy = new Float32Array(0);
  /** Temperature, °C. */
  t = new Float32Array(0);
  /** Rest offset from the piece's centre (shape matching target), and the round shape it relaxes to. */
  rx = new Float32Array(0); ry = new Float32Array(0);
  hx = new Float32Array(0); hy = new Float32Array(0);
  alive = new Uint8Array(0);
  piece = new Int32Array(0);
  deg = new Uint8Array(0);
  /** Seconds before a torn particle may bond again. */
  cool = new Float32Array(0);
  /** Contacts this step: summed normal, hardest impact speed, material and cell touched. */
  cnx = new Float32Array(0); cny = new Float32Array(0);
  hit = new Float32Array(0);
  cmat = new Uint8Array(0);
  ccell = new Int32Array(0);
  private fz = new Float32Array(0);
  private rn = new Float32Array(0);
  private al = new Float32Array(0);
  /** Speed the underside of each particle runs at against floors and ceilings (crawling). */
  private tread = new Float32Array(0);
  /** Shift from pushing apart overlapping pieces this substep, which mustn't become velocity. */
  private fsx = new Float32Array(0);
  private fsy = new Float32Array(0);
  /** Shape-matching pull per particle, before taking out net shift and spin. */
  private dsx = new Float32Array(0);
  private dsy = new Float32Array(0);

  ba = new Int32Array(0); bb = new Int32Array(0);
  bl = new Float32Array(0);
  /** Natural length each bond relaxes back to when he's neither frozen nor runny. */
  bn = new Float32Array(0);
  nb = 0;

  order = new Int32Array(0);
  pieces: Piece[] = [];
  /** Particles alive, and how many he started with. */
  count = 0;
  total = 0;
  /** Why particles were lost, for the HUD. */
  losses = { boiled: 0, dissolved: 0, crushed: 0, fell: 0 };
  /** Debug counters. */
  breaks = { strain: 0, impact: 0, merge: 0 };

  /** Controller state for the main piece. */
  charge = 0;
  stretch = 0;
  coyote = 0;
  facing = 1;
  private held = false;
  /** Jump released this long ago and not yet used (fires on landing), with the charge it had. */
  private buffer = 0;
  private banked = 0;
  /** The main piece is frozen rigid. */
  private rigid = false;
  /** The player is asking for something: he shivers, which warms him a little. */
  private effort = false;
  /** Squash of the main piece's target shape (world frame), sx * sy = 1. */
  sx = 1;
  sy = 1;
  private sag = 0;

  private seed = 1;
  private dirty = false;
  private head = new Int32Array(0);
  private next = new Int32Array(0);
  private ww = 0;
  private world: World | null = null;
  private mergeA: number[] = [];
  private mergeB: number[] = [];

  constructor(tweaks: Tweaks = DEFAULTS, seed = 1) {
    this.tweaks = { ...tweaks };
    this.seed = seed >>> 0 || 1;
  }

  rand(): number {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  /** Make a fresh round Bob centred at (cx, cy) (his bottom rests about `size` below). */
  spawn(world: World, cx: number, cy: number, temp = 20): void {
    const r = this.tweaks.size;
    const pts: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r * 0.5) pts.push([dx, dy]);
    const n = pts.length, cap = n * 2;
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.px = f(); this.py = f(); this.vx = f(); this.vy = f(); this.t = f();
    this.rx = f(); this.ry = f(); this.hx = f(); this.hy = f(); this.cool = f();
    this.cnx = f(); this.cny = f(); this.hit = f(); this.fz = f(); this.rn = f(); this.al = f(); this.tread = f(); this.fsx = f(); this.fsy = f(); this.dsx = f(); this.dsy = f();
    this.alive = new Uint8Array(cap); this.piece = new Int32Array(cap); this.deg = new Uint8Array(cap);
    this.cmat = new Uint8Array(cap); this.ccell = new Int32Array(cap);
    this.ba = new Int32Array(cap * NB / 2); this.bb = new Int32Array(cap * NB / 2); this.bl = new Float32Array(cap * NB / 2); this.bn = new Float32Array(cap * NB / 2);
    this.nb = 0;
    this.order = new Int32Array(cap);
    this.ww = world.w;
    this.world = world;
    this.head = new Int32Array(world.w * world.h).fill(-1);
    this.next = new Int32Array(cap);
    const index = new Map<number, number>();
    const key = (dx: number, dy: number) => (dy + 64) * 256 + dx + 64;
    pts.forEach(([dx, dy], i) => {
      this.x[i] = this.px[i] = cx + dx + 0.5;
      this.y[i] = this.py[i] = cy + dy + 0.5;
      this.rx[i] = this.hx[i] = dx;
      this.ry[i] = this.hy[i] = dy;
      this.t[i] = temp;
      this.alive[i] = 1;
      index.set(key(dx, dy), i);
    });
    pts.forEach(([dx, dy], i) => {
      for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const j = index.get(key(dx + ox, dy + oy));
        if (j !== undefined) this.bond(i, j, Math.hypot(ox, oy));
      }
    });
    this.count = this.total = n;
    this.losses = { boiled: 0, dissolved: 0, crushed: 0, fell: 0 };
    this.charge = this.stretch = this.coyote = this.sag = this.buffer = this.banked = 0;
    this.rigid = false;
    this.sx = this.sy = 1;
    this.held = false;
    this.rebuild(true);
  }

  private bond(a: number, b: number, len: number): void {
    if (this.nb >= this.ba.length || this.deg[a] >= NB || this.deg[b] >= NB) return;
    this.ba[this.nb] = a; this.bb[this.nb] = b; this.bl[this.nb] = this.bn[this.nb] = len;
    this.nb++;
    this.deg[a]++; this.deg[b]++;
  }

  private unbond(k: number): void {
    this.deg[this.ba[k]]--; this.deg[this.bb[k]]--;
    const l = --this.nb;
    this.ba[k] = this.ba[l]; this.bb[k] = this.bb[l]; this.bl[k] = this.bl[l]; this.bn[k] = this.bn[l];
    this.dirty = true;
  }

  /** Break every bond of particle i. */
  private tear(i: number): void {
    for (let k = this.nb - 1; k >= 0; k--) if (this.ba[k] === i || this.bb[k] === i) this.unbond(k);
    this.cool[i] = 0.6;
  }

  /** Break the bonds of piece p that cross the segment through (ox, oy) along (dx, dy), half-length len. */
  private cut(p: number, ox: number, oy: number, dx: number, dy: number, len: number): void {
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

  private kill(i: number, why: keyof Blob["losses"]): void {
    if (!this.alive[i]) return;
    this.tear(i);
    this.alive[i] = 0;
    this.count--;
    this.losses[why]++;
    this.dirty = true;
  }

  private solid(world: World, cx: number, cy: number): boolean {
    if (cx < 0 || cx >= world.w || cy >= world.h) return true;
    if (cy < 0) return false;
    const c = CAT[world.mat[cy * world.w + cx]];
    return c === STATIC || c === POWDER;
  }

  /** Main piece, or undefined once he's all gone. */
  get main(): Piece | undefined {
    return this.pieces[0];
  }

  step(world: World, input: Input): void {
    if (!this.count) return;
    this.world = world;
    const tw = this.tweaks, n = this.cap;
    const { x, y, px, py, vx, vy, t, alive, fz, rn, cnx, cny, hit, cmat, ccell, cool, fsx, fsy } = this;

    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const T = this.fixedTemp ?? t[i];
      fz[i] = frozenness(T); rn[i] = runniness(T);
      // Shape memory per substep: frozen is rigid; runny barely keeps a shape.
      const mem = Math.max(tw.memory * tw.memory * 0.5 * (1 - 0.92 * rn[i]), 0.85 * fz[i]);
      this.al[i] = 1 - Math.pow(1 - mem, 1 / SUB);
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
    const soft = 60 * tw.softness * tw.softness;
    for (let s = 0; s < SUB; s++) {
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
      this.shapeMatch();
      this.solveBonds(soft, s === SUB - 1);
      this.separate(s === SUB - 1);
      this.collide(world);
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        vx[i] = (x[i] - px[i] - fsx[i]) / H; vy[i] = (y[i] - py[i] - fsy[i]) / H;
        // Safety net: no particle outruns a hard fall.
        const sp = vx[i] * vx[i] + vy[i] * vy[i];
        if (sp > VMAX * VMAX) { const k = VMAX / Math.sqrt(sp); vx[i] *= k; vy[i] *= k; }
      }
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

  private control(input: Input): void {
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

    // Freezing sets him rigid in his current shape: his squash stops being applied in
    // world space (or a rolling frozen dome would be forced to change shape every frame).
    const fzP = frozenness(T);
    if (!this.rigid && fzP > 0.5) { this.rigid = true; this.reshapePiece(p); }
    else if (this.rigid && fzP < 0.4) { this.rigid = false; this.sag = 0; this.reshapePiece(p); }

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
      }
    }
    if (!this.held) this.charge = 0;
    // He settles into a dome on the ground and rounds up in the air (world frame, so it doesn't roll with him).
    // Runny, he slumps much flatter: a puddle that can ooze under low gaps.
    this.sag += ((grounded ? 0.16 + 1.4 * runniness(T) : 0) - this.sag) * 0.15;
    const sq = (1 + this.sag) * (1 + 0.35 * this.charge * Math.min(1, m));
    this.sx = this.rigid ? 1 : this.stretch > 0 ? 0.84 : sq;
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
      const accel = (dir ? 45 : 8) * m * (1 - ooze) * (grounded ? 1 : dir ? tw.air * 0.5 : 0);
      const dw = Math.max(-accel * DT, Math.min(accel * DT, target - w));
      if (dw)
        for (let k = p.start; k < p.start + p.len; k++) {
          const i = order[k];
          vx[i] -= dw * (y[i] - p.cy); vy[i] += dw * (x[i] - p.cx);
        }
    }
    // Crawl: his underside runs like a conveyor along whatever it touches. Friction
    // does the pushing, so this needs grip as much as rolling does (none on ice).
    const tread = dir * tw.speed * 1.5 * ooze * Math.min(1, m);
    this.tread.fill(0);
    if (tread) for (let k = p.start; k < p.start + p.len; k++) this.tread[order[k]] = tread;
    // Steering in the air or water: weak, and only up to his top speed.
    if (dir && (!grounded || swim) && dir * p.vx < tw.speed) {
      const a = dir * (swim ? Math.max(tw.air, 0.4) : tw.air) * 500 * DT * Math.min(1, m + 0.2);
      for (let k = p.start; k < p.start + p.len; k++) vx[order[k]] += a;
    }
    // Swimming up: holding jump in water paddles upward.
    if (swim && input.jump && m > 0.05)
      for (let k = p.start; k < p.start + p.len; k++) vy[order[k]] -= 520 * DT * Math.min(1, m);
  }

  // ---- Constraints ----

  /** Pull each piece towards its rest shape, rotated to fit (2D polar decomposition). */
  private shapeMatch(): void {
    const { x, y, rx, ry, order } = this;
    for (let pi = 0; pi < this.pieces.length; pi++) {
      const p = this.pieces[pi];
      if (p.len < 3) continue;
      let cx = 0, cy = 0;
      for (let k = p.start; k < p.start + p.len; k++) { const i = order[k]; cx += x[i]; cy += y[i]; }
      cx /= p.len; cy /= p.len;
      let a = 0, b = 0, c = 0, d = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - cx, oy = y[i] - cy;
        a += ox * rx[i]; b += ox * ry[i]; c += oy * rx[i]; d += oy * ry[i];
      }
      const th = Math.atan2(c - b, a + d), co = Math.cos(th), si = Math.sin(th);
      const [sx, sy] = this.squash(pi, p.temp);
      // Each particle's pull towards its goal. Particles can pull with different strengths
      // (half frozen: the cold side is stiffer), and uneven pulls would shift and spin the
      // whole piece by themselves. So take out any net shift and net spin: shape matching
      // only ever changes his shape, never moves him.
      const { dsx, dsy } = this;
      let mx = 0, my = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], al = this.al[i];
        const gx = cx + (co * rx[i] - si * ry[i]) * sx, gy = cy + (si * rx[i] + co * ry[i]) * sy;
        dsx[i] = (gx - x[i]) * al; dsy[i] = (gy - y[i]) * al;
        mx += dsx[i]; my += dsy[i];
      }
      mx /= p.len; my /= p.len;
      let tq = 0, inertia = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - cx, oy = y[i] - cy;
        dsx[i] -= mx; dsy[i] -= my;
        tq += ox * dsy[i] - oy * dsx[i]; inertia += ox * ox + oy * oy;
      }
      const spin = inertia > 0 ? tq / inertia : 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - cx, oy = y[i] - cy;
        x[i] += dsx[i] + spin * oy; y[i] += dsy[i] - spin * ox;
      }
    }
  }

  /** XPBD distance bonds, one pass per substep. Overstretched bonds break; hot ones creep instead (taffy). */
  private solveBonds(soft: number, breaking: boolean): void {
    const tw = this.tweaks, { x, y, ba, bb, bl, fz, rn } = this;
    const breakBase = 0.25 + 1.5 * tw.cohesion;
    for (let k = this.nb - 1; k >= 0; k--) {
      const a = ba[k], b = bb[k];
      const dx = x[b] - x[a], dy = y[b] - y[a];
      const len = Math.hypot(dx, dy) || 1e-6;
      const f = (fz[a] + fz[b]) * 0.5, r = (rn[a] + rn[b]) * 0.5;
      const strain = len / bl[k] - 1;
      // (Frozen Bob doesn't tear by stretching: he cracks on impact instead, see impacts().)
      const limit = breakBase * (1 + 2 * r);
      // Only judged once a step, so a hard landing's momentary squeeze doesn't count.
      if (breaking && strain > limit) { this.breaks.strain++; this.unbond(k); this.cool[a] = this.cool[b] = 0.3 * (1 - r); continue; }
      const alpha = soft * (1 + 20 * r);
      const corr = (len - bl[k]) / (2 + alpha) / len;
      x[a] += dx * corr; y[a] += dy * corr;
      x[b] -= dx * corr; y[b] -= dy * corr;
      // Freezing sets him in whatever shape he is in.
      if (f > 0) bl[k] += (len - bl[k]) * f * 0.05;
      // Runny Bob is taffy: bonds take on whatever length they're pulled to, so he pours and stays poured.
      else if (r > 0) bl[k] = Math.max(0.6, Math.min(4, bl[k] + (len - bl[k]) * r * 0.05));
      // Normally, bonds settle to the spacing of the particles in his rest shape, so they
      // agree with his shape memory: otherwise bonds made while he was squashed flat (merging
      // bits back on) would hold him flat, and a lump that's flat can't roll. Bonds between
      // particles that aren't neighbours in his rest shape just go slack.
      else {
        const rest = Math.hypot(this.rx[a] - this.rx[b], this.ry[a] - this.ry[b]);
        bl[k] += ((rest < 2 ? Math.max(0.7, rest) : len) - bl[k]) * 0.01;
      }
    }
  }

  /** Keep particles from piling onto each other; note pieces touching (they may merge). */
  private separate(noteMerges: boolean): void {
    const { x, y, fsx, fsy, alive, head, next, piece, cool, deg, fz, rn } = this, n = this.cap, w = this.ww;
    const cells: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
      if (cx < 0 || cy < 0 || cx >= w || cy * w + cx >= head.length) { next[i] = -2; continue; }
      const c = cy * w + cx;
      if (head[c] === -1) cells.push(c);
      next[i] = head[c];
      head[c] = i;
    }
    const merge = noteMerges && this.tweaks.cohesion > 0.1;
    const attract = this.tweaks.cohesion * 0.01;
    for (let i = 0; i < n; i++) {
      if (!alive[i] || next[i] === -2) continue;
      const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const qx = cx + ox, qy = cy + oy;
          if (qx < 0 || qy < 0 || qx >= w) continue;
          const c = qy * w + qx;
          if (c >= head.length) continue;
          for (let j = head[c]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy;
            if (d2 < R0 * R0) {
              // Coincident particles: split them sideways.
              const d = Math.sqrt(d2), ok = d > 1e-4;
              const corr = (R0 - (ok ? d : 0)) * 0.5;
              const ux = ok ? dx / d : (i & 1 ? 1 : -1), uy = ok ? dy / d : 0;
              x[i] -= ux * corr; y[i] -= uy * corr;
              x[j] += ux * corr; y[j] += uy * corr;
              // Between pieces, move without gaining speed (that shift is taken back out of the
              // velocity): two stiff (frozen) bits pressed together would otherwise push each
              // other faster every substep.
              if (piece[i] !== piece[j]) {
                fsx[i] -= ux * corr; fsy[i] -= uy * corr;
                fsx[j] += ux * corr; fsy[j] += uy * corr;
              }
            }
            // Surface tension: separate bits near each other draw together (and then rejoin).
            else if (attract && piece[i] !== piece[j] && d2 < 4) {
              // (A drift, not a force: it isn't allowed to build up speed.)
              const d = Math.sqrt(d2), k = (attract * (d - R0)) / d;
              x[i] += dx * k; y[i] += dy * k;
              x[j] -= dx * k; y[j] -= dy * k;
              fsx[i] += dx * k; fsy[i] += dy * k;
              fsx[j] -= dx * k; fsy[j] -= dy * k;
            }
            // Rejoin: different pieces touching, or the same piece healing a torn spot.
            if (merge && (piece[i] !== piece[j] || (deg[i] < 5 && deg[j] < 5) || rn[i] > 0.3) && d2 < 1.3 && cool[i] <= 0 && cool[j] <= 0 && deg[i] < NB && deg[j] < NB && fz[i] < 0.5 && fz[j] < 0.5) {
              this.mergeA.push(i); this.mergeB.push(j);
            }
          }
        }
    }
    for (const c of cells) head[c] = -1;
  }

  /** Point particles against solid cells, one axis at a time, with friction and a one-pixel step-up. */
  private collide(world: World): void {
    const { x, y, px, py, vx, vy, alive, cnx, cny, hit, cmat, ccell } = this, n = this.cap;
    const grip = this.tweaks.grip, ww = world.w;
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
      // Last resort: never end inside a solid.
      if (this.solid(world, Math.floor(nx), Math.floor(ny))) { nx = px[i]; ny = py[i]; if ((globalThis as any).REV) (globalThis as any).REV.push(i); }
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
  private damp(): void {
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
        // A frozen lump landing stays down: shape matching would otherwise spring it back up.
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
      // Only frozen Bob is damped: jelly keeps its wobble, and oozing is all internal motion.
      const w = den > 0 ? num / den : 0, k = 0.8 * f;
      for (let j = p.start; j < p.start + p.len; j++) {
        const i = order[j], ox = x[i] - cx, oy = y[i] - cy;
        const rx = mvx - w * oy, ry = mvy + w * ox;
        vx[i] += (rx - vx[i]) * k;
        vy[i] += (ry - vy[i]) * k;
        // No particle races about inside him: splashes stay soft, and the faces of a fresh
        // cut don't spray off when he lands.
        const dx = vx[i] - rx, dy = vy[i] - ry, d2 = dx * dx + dy * dy;
        const cap = RELMAX * (1 + 4 * r);
        if (d2 > cap * cap) { const c = cap / Math.sqrt(d2); vx[i] = rx + dx * c; vy[i] = ry + dy * c; }
      }
    }
  }

  /** Hard hits tear him: sharp things slice, frozen Bob cracks, anything else splashes off droplets. */
  private impacts(): void {
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
  private slopeUnder(cx: number, cy: number, r: number): number {
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

  /** Exchange heat with the cells he's in and touching; boil off or dissolve. */
  private heat(world: World): void {
    const { t, alive, x, y, ccell, ba, bb } = this, ww = world.w;
    if (this.fixedTemp !== null) {
      for (let i = 0; i < this.cap; i++) if (alive[i]) t[i] = this.fixedTemp;
    } else {
      for (let i = 0; i < this.cap; i++) {
        if (!alive[i]) continue;
        const cx = Math.floor(x[i]), cy = Math.floor(y[i]);
        if (world.inside(cx, cy)) {
          const c = cy * ww + cx, m = world.mat[c];
          const k = m === M.air ? 0.012 : 0.05 + CONDUCT[m];
          t[i] += (world.temp[c] - t[i]) * Math.min(0.5, k);
        }
        const c = ccell[i];
        if (c >= 0) t[i] += (world.temp[c] - t[i]) * Math.min(0.5, 0.02 + CONDUCT[world.mat[c]] * 0.5);
      }
      // Trying to move in the cold, he shivers: a little body heat (only the main piece is trying).
      const p = this.pieces[0];
      if (this.effort && p)
        for (let k = p.start; k < p.start + p.len; k++) { const i = this.order[k]; if (t[i] < 20) t[i] += SHIVER; }
      // Heat spreads through him along his bonds.
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

  /** Touching pieces rejoin (how readily depends on cohesion). */
  private merge(): void {
    const { mergeA, mergeB } = this;
    for (let k = 0; k < mergeA.length && k < 96; k++) {
      const a = mergeA[k], b = mergeB[k];
      const chance = this.tweaks.cohesion * 0.4 + (this.rn[a] + this.rn[b]) * 0.3;
      if (!this.alive[a] || !this.alive[b] || this.rand() > chance || this.bonded(a, b)) continue;
      this.bond(a, b, Math.max(1, Math.hypot(this.x[a] - this.x[b], this.y[a] - this.y[b])));
      this.breaks.merge++;
      if (this.piece[a] !== this.piece[b]) this.dirty = true;
    }
    mergeA.length = mergeB.length = 0;
  }

  private bonded(a: number, b: number): boolean {
    for (let k = 0; k < this.nb; k++) if ((this.ba[k] === a && this.bb[k] === b) || (this.ba[k] === b && this.bb[k] === a)) return true;
    return false;
  }

  /** Rest shapes slowly round off again (not while frozen: shards keep their shape). */
  private relax(): void {
    const { rx, ry, hx, hy, alive, fz } = this;
    for (let i = 0; i < this.cap; i++) {
      if (!alive[i]) continue;
      const k = 0.05 * (1 - fz[i]);
      rx[i] += (hx[i] - rx[i]) * k; ry[i] += (hy[i] - ry[i]) * k;
    }
  }

  /** Group particles into connected pieces. Pieces that changed get a new rest shape: as they are now, rounding off over time. */
  private rebuild(keepAll: boolean): void {
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
    const list = [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
    this.pieces = [];
    let o = 0;
    for (const [pi, members] of list.entries()) {
      const prev = piece[members[0]];
      // Unchanged: same members, and still (or still not) the main piece, whose target gets squashed.
      const same = keepAll || (old[prev] !== undefined && old[prev].len === members.length && (prev === 0) === (pi === 0) && members.every((i) => piece[i] === prev));
      const p: Piece = { start: o, len: members.length, cx: 0, cy: 0, vx: 0, vy: 0, temp: 20, radius: 1, ground: old[prev]?.ground ?? 0, nx: 0, ny: -1, wet: 0 };
      for (const i of members) this.order[o++] = i;
      // Every piece's target is squashed (see squash()): undo that so it starts where it is.
      if (!same) {
        let tt = 0;
        for (const i of members) tt += this.t[i];
        const [sx, sy] = this.squash(pi, this.fixedTemp ?? tt / members.length);
        this.reshape(members, sx, sy);
      }
      this.pieces.push(p);
    }
    this.pieces.forEach((p, pi) => { for (let k = p.start; k < p.start + p.len; k++) piece[this.order[k]] = pi; });
    this.stats();
  }

  /**
   * World-space squash of a piece's target shape. The piece he's controlling remembers being
   * round (a slight dome on the ground, squashed and stretched by jumping). Every other bit
   * has no will of its own and slumps flat, as far as his cohesion lets it: a thin film at
   * low cohesion, a thick lump at high; runny bits spread further. (Frozen bits keep whatever
   * shape they froze in, since this doesn't change with cold.)
   */
  private squash(pi: number, temp: number): [number, number] {
    if (pi === 0) return [this.sx, this.sy];
    const a = Math.max(0.2, (0.45 + 0.45 * this.tweaks.cohesion) * (1 - 0.5 * runniness(temp)));
    return [1 / a, a];
  }

  /** Take the piece's current shape as its rest shape (freezing and thawing). */
  private reshapePiece(p: Piece): void {
    this.reshape(Array.from(this.order.subarray(p.start, p.start + p.len)), 1, 1, true);
  }

  /**
   * New rest shape for a changed piece. If most of it was one piece before (a bit torn off,
   * or a droplet rejoining), it keeps that piece's memory of its shape, and newcomers take
   * their place in it from where they are now; otherwise its current shape becomes the rest
   * shape. Either way it relaxes towards a round blob of its new size.
   */
  private reshape(members: number[], sx: number, sy: number, fresh = false): void {
    const { x, y, rx, ry, hx, hy, piece } = this;
    let cx = 0, cy = 0;
    const counts = new Map<number, number>();
    for (const i of members) counts.set(piece[i], (counts.get(piece[i]) ?? 0) + 1);
    let src = -1, best = 0;
    for (const [k, v] of counts) if (v > best) { best = v; src = k; }
    const kept = fresh ? [] : members.filter((i) => piece[i] === src);
    if (kept.length >= 3 && kept.length * 2 >= members.length) {
      // Fit the old rest shape to where the kept particles are now (2D polar decomposition).
      let rcx = 0, rcy = 0;
      for (const i of kept) { cx += x[i]; cy += y[i]; rcx += rx[i]; rcy += ry[i]; }
      cx /= kept.length; cy /= kept.length; rcx /= kept.length; rcy /= kept.length;
      let a = 0, b = 0, c = 0, d = 0;
      for (const i of kept) {
        const ox = (x[i] - cx) / sx, oy = (y[i] - cy) / sy, qx = rx[i] - rcx, qy = ry[i] - rcy;
        a += ox * qx; b += ox * qy; c += oy * qx; d += oy * qy;
      }
      const th = Math.atan2(c - b, a + d), co = Math.cos(th), si = Math.sin(th);
      for (const i of members) {
        if (piece[i] === src) continue;
        const ox = (x[i] - cx) / sx, oy = (y[i] - cy) / sy;
        rx[i] = co * ox + si * oy + rcx; ry[i] = -si * ox + co * oy + rcy;
      }
      let mx = 0, my = 0;
      for (const i of members) { mx += rx[i]; my += ry[i]; }
      mx /= members.length; my /= members.length;
      for (const i of members) { rx[i] -= mx; ry[i] -= my; }
    } else {
      for (const i of members) { cx += x[i]; cy += y[i]; }
      cx /= members.length; cy /= members.length;
      for (const i of members) { rx[i] = (x[i] - cx) / sx; ry[i] = (y[i] - cy) / sy; }
    }
    // Round target: inflate (or deflate) the outline evenly into a disc of the same area,
    // along each direction from the centre. Neighbours stay neighbours, so he can get there
    // by deforming, without particles having to pass through each other.
    const n = members.length, BINS = 24, ext = new Float32Array(BINS);
    const bin = (i: number) => ((Math.atan2(ry[i], rx[i]) / (Math.PI * 2)) * BINS + BINS + 0.5) % BINS;
    for (const i of members) {
      const k = Math.floor(bin(i)) % BINS;
      ext[k] = Math.max(ext[k], Math.hypot(rx[i], ry[i]) + 0.5);
    }
    // Directions with no particles (or a notch) borrow from their neighbours.
    for (let pass = 0; pass < 2; pass++)
      for (let k = 0; k < BINS; k++) ext[k] = Math.max(ext[k], 0.5 * (ext[(k + BINS - 1) % BINS] + ext[(k + 1) % BINS]), 0.5);
    const R = Math.sqrt(n / Math.PI) + 0.5;
    let mx = 0, my = 0;
    for (const i of members) {
      const u = bin(i), k0 = Math.floor(u) % BINS, k1 = (k0 + 1) % BINS, f = u - Math.floor(u);
      const e = ext[k0] * (1 - f) + ext[k1] * f, sc = R / e;
      hx[i] = rx[i] * sc; hy[i] = ry[i] * sc;
      mx += hx[i]; my += hy[i];
    }
    mx /= n; my /= n;
    // Then settle each particle on the nearest free point of an evenly spaced disc (one per
    // pixel), innermost first: packed-together particles (bits merging) would otherwise be
    // remembered packed, push apart against their own memory and lock him up flat.
    let r2 = 0;
    for (const i of members) { hx[i] -= mx; hy[i] -= my; r2 += hx[i] * hx[i] + hy[i] * hy[i]; }
    const want = Math.sqrt(n / Math.PI / 2), have = Math.sqrt(r2 / n) || 1;
    for (const i of members) { hx[i] *= want / have; hy[i] *= want / have; }
    const L = Math.ceil(Math.sqrt(n / Math.PI)) + 3, pts: [number, number][] = [];
    for (let dy = -L; dy <= L; dy++) for (let dx = -L; dx <= L; dx++) pts.push([dx, dy]);
    pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
    const free = new Set<number>(), key = (dx: number, dy: number) => (dy + 64) * 128 + dx + 64;
    let px = 0, py = 0;
    for (let k = 0; k < n; k++) { free.add(key(pts[k][0], pts[k][1])); px += pts[k][0]; py += pts[k][1]; }
    px /= n; py /= n;
    for (const i of [...members].sort((a, b) => hx[a] * hx[a] + hy[a] * hy[a] - hx[b] * hx[b] - hy[b] * hy[b])) {
      const fx = Math.round(hx[i] + px), fy = Math.round(hy[i] + py);
      let bx = 0, by = 0, bd = Infinity;
      for (let r = 0; r <= 2 * L && bd === Infinity; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !free.has(key(fx + dx, fy + dy))) continue;
            const d = (fx + dx - px - hx[i]) ** 2 + (fy + dy - py - hy[i]) ** 2;
            if (d < bd) { bd = d; bx = fx + dx; by = fy + dy; }
          }
      free.delete(key(bx, by));
      hx[i] = bx - px; hy[i] = by - py;
    }
  }

  private stats(): void {
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

  /** Particles inside a rectangle (for "how much of Bob reached the goal"). */
  countIn(x0: number, y0: number, x1: number, y1: number): number {
    let c = 0;
    for (let i = 0; i < this.cap; i++) if (this.alive[i] && this.x[i] >= x0 && this.x[i] < x1 && this.y[i] >= y0 && this.y[i] < y1) c++;
    return c;
  }
}
