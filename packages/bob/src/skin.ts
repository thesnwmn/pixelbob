import { CAT, Cat, type World } from "@pixelbob/sim";
import { Body } from "./body.ts";
import type { BobModel, BobView, Input, Losses, ModelKind, Piece } from "./model.ts";
import { DEFAULTS, type Tweaks } from "./tweaks.ts";

/** Room for ring points (they come and go as his skin stretches and he splits). */
const CAP = 2400;
/** Ring points sit about this far apart; an edge longer than SPLIT gets a new point, shorter than JOIN loses one. */
const SPACING = 1;
const SPLIT = 1.6;
const JOIN = 0.5;
/** Points of skin that aren't neighbours keep this far apart (so the skin never crosses itself). */
const APART = 0.9;
/** Two points of the same runny ring this close, and at least PINCH_GAP points apart along it, pinch it in two. */
const PINCH = 0.7;
const PINCH_GAP = 8;
/** ...and pulling apart at least this fast (px/s). */
const PART = 4;
/** Points this few apart along the skin don't push each other apart. */
const NEAR = 3;
/** Touching rings this close join up. */
const JOIN_R = 0.9;
/** Chance a touching pair of points joins their rings, each step, at full cohesion. */
const JOIN_CHANCE = 0.03;
/** Most the round outline moves a point per substep (px), and the most it scales him by. */
const ROUND_MAX = 0.08;
/** Most the pressure moves a point per substep (px). */
const PUSH_MAX = 0.5;
const RATIO = 1.25;
/** Runny stickiness: pull onto a face he touches, the most it holds with (px/s²), how close counts as touching. */
const ADHESION = 0.35;
const HOLD = 1500;
const TOUCH = 0.35;
const FLOOR_DRAG = 0.3;

/**
 * The ring of points that is Bob's skin, with the gas pressure inside it (Gish, LocoRoco):
 * the Body handles the points (collisions, water, heat, rolling and jumping); this adds the
 * skin's tension, the pressure that keeps his area, a will to be round, and the topology:
 * rings are cut by spikes and cracks, join when they touch, and pinch in two at a thin neck
 * when runny. Each point carries a share of its ring's area: that's his mass.
 */
class Rings extends Body {
  readonly kind = "skin";
  nxt = new Int32Array(0);
  prv = new Int32Array(0);
  /** Area (in pixels, i.e. particles of the other models) each point carries. */
  ash = new Float32Array(0);
  /** Area lost, by cause. */
  lost: Losses = { boiled: 0, dissolved: 0, crushed: 0, fell: 0 };
  /** Rings as runs of `seq` (in skin order), parallel to pieces. */
  seq = new Int32Array(0);
  rings: { start: number; len: number; area: number; target: number }[] = [];
  private frz = new Uint8Array(0);
  private rx = new Float32Array(0);
  private ry = new Float32Array(0);
  private ks = new Float32Array(0);
  private round = new Float32Array(0);
  private stiff = new Float32Array(0);
  private dsx = new Float32Array(0);
  private dsy = new Float32Array(0);
  private pa = new Int32Array(0);
  private pb = new Int32Array(0);
  private np = 0;
  private free: number[] = [];
  private used = 0;
  private tense = 0;
  private unstick = 0;

  constructor(tweaks: Tweaks, seed: number) {
    super(tweaks, seed, 8);
    // (Runny, surface tension and gravity decide how he puddles, not his will.)
    this.sagRunny = 0.6;
    this.settleRate = 0.5;
    this.keepControl = true;
    this.pourGain = 0.3;
  }

  /** Viscosity along the skin: each point's velocity eased towards its neighbours' (more when runny). */
  protected override settle(): void {
    const { vx, vy, nxt, prv, rn, alive } = this;
    for (let i = 0; i < this.used; i++) {
      if (!alive[i]) continue;
      const a = prv[i], b = nxt[i], mu = 0.05 + 0.25 * rn[i];
      vx[i] += ((vx[a] + vx[b]) / 2 - vx[i]) * mu;
      vy[i] += ((vy[a] + vy[b]) / 2 - vy[i]) * mu;
    }
  }

  protected alloc(cap: number): void {
    const f = () => new Float32Array(cap);
    this.nxt = new Int32Array(cap); this.prv = new Int32Array(cap); this.ash = f();
    this.frz = new Uint8Array(cap); this.rx = f(); this.ry = f();
    this.ks = f(); this.round = f(); this.stiff = f(); this.dsx = f(); this.dsy = f();
    this.pa = new Int32Array(cap * 12); this.pb = new Int32Array(cap * 12);
    this.seq = new Int32Array(cap);
  }

  /** A ring per disc: the outline of the same area as the other models' particles. */
  spawnRings(world: World, discs: { x: number; y: number; r: number }[], temp: number): number {
    this.allocate(world, CAP);
    this.free = []; this.used = 0;
    this.lost = { boiled: 0, dissolved: 0, crushed: 0, fell: 0 };
    let total = 0;
    for (const { x, y, r } of discs) {
      let area = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r * 0.5) area++;
      total += area;
      const R = Math.sqrt(area / Math.PI), n = Math.max(6, Math.round((2 * Math.PI * R) / SPACING));
      const cx = Math.round(x) + 0.5, cy = Math.round(y) + 0.5, first = this.used;
      for (let k = 0; k < n; k++) {
        const i = this.used++, a = (k / n) * Math.PI * 2;
        this.x[i] = this.px[i] = cx + Math.cos(a) * R;
        this.y[i] = this.py[i] = cy + Math.sin(a) * R;
        this.t[i] = temp;
        this.alive[i] = 1;
        this.ctl[i] = first === 0 ? 1 : 0;
        this.ash[i] = area / n;
        this.nxt[i] = k === n - 1 ? first : i + 1;
        this.prv[i] = k === 0 ? first + n - 1 : i - 1;
      }
      for (let k = 0; k < n; k++) this.link(first + k, this.nxt[first + k]);
    }
    this.count = this.total = this.used;
    this.started();
    this.order2();
    return total;
  }

  private link(a: number, b: number): void {
    this.bond(a, b, Math.hypot(this.x[b] - this.x[a], this.y[b] - this.y[a]));
  }

  private unlink(a: number, b: number): void {
    for (let k = 0; k < this.nb; k++) if ((this.ba[k] === a && this.bb[k] === b) || (this.ba[k] === b && this.bb[k] === a)) { this.unbond(k); return; }
  }

  private take(): number {
    const i = this.free.length ? this.free.pop()! : this.used < this.cap ? this.used++ : -1;
    if (i >= 0) { this.alive[i] = 1; this.count++; this.frz[i] = 0; this.cool[i] = 0; this.piece[i] = 0; }
    return i;
  }

  private drop(i: number): void {
    this.alive[i] = 0; this.count--; this.ash[i] = 0;
    this.free.push(i);
  }

  /**
   * Swap the points after a and b: on one ring it cuts it in two (between a and its next,
   * and b and its next, joined across), on two rings it splices them into one.
   */
  private swap(a: number, b: number): void {
    const a1 = this.nxt[a], b1 = this.nxt[b];
    this.unlink(a, a1); this.unlink(b, b1);
    this.nxt[a] = b1; this.prv[b1] = a;
    this.nxt[b] = a1; this.prv[a1] = b;
    this.link(a, b1); this.link(b, a1);
    this.dirty = true;
  }

  /** Points from a to b along the ring (b excluded), or -1 if b isn't within max. */
  private along(a: number, b: number, max: number): number {
    let i = a;
    for (let k = 0; k < max; k++) { if (i === b) return k; i = this.nxt[i]; }
    return -1;
  }

  /** Cut the ring holding a and b in two between them, sharing its area by the halves' sizes. */
  private split(a: number, b: number): boolean {
    const n = this.ringOf(a);
    const d = this.along(a, b, n + 1);
    if (d < 3 || n - d < 3) return false;
    const before = this.walk(a).reduce((s, i) => s + this.ash[i], 0);
    this.swap(a, b);
    // A cut that leaves a half turned inside out (the skin crossed itself) is undone.
    if (this.polyArea(this.walk(a)) <= 0 || this.polyArea(this.walk(b)) <= 0) { this.swap(a, b); return false; }
    // The skin either side of the cut keeps apart for a moment (or it'd just rejoin).
    for (const e of [a, b]) {
      let u = e, v = e;
      for (let k = 0; k < 5; k++) { this.cool[u] = this.cool[v] = Math.max(this.cool[u], 0.5); u = this.nxt[u]; v = this.prv[v]; }
    }
    const r1 = this.walk(a), r2 = this.walk(b);
    const A1 = Math.max(0.1, Math.abs(this.polyArea(r1))), A2 = Math.max(0.1, Math.abs(this.polyArea(r2)));
    for (const [r, A] of [[r1, A1], [r2, A2]] as const) for (const i of r) this.ash[i] = (before * A) / (A1 + A2) / r.length;
    return true;
  }

  /** Most points a ring may have: a few times the perimeter of a circle of its area (a safety net). */
  private maxPoints(i: number): number {
    const r = this.rings[this.piece[i]];
    return r ? 4 * 2 * Math.sqrt(Math.PI * Math.max(4, r.target)) / SPACING : 64;
  }

  /** How fast the two halves of a ring, either side of i and j, are moving apart (px/s). */
  private parting(i: number, j: number): number {
    const { x, y, vx, vy, nxt } = this, h = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    let side = 0;
    for (let k = nxt[i], n = 0; n < this.cap; k = nxt[k], n++) {
      const s = h[side];
      s[0] += x[k]; s[1] += y[k]; s[2] += vx[k]; s[3] += vy[k]; s[4]++;
      if (k === j) side = 1;
      if (k === i) break;
    }
    const [a, b] = h;
    if (!a[4] || !b[4]) return 0;
    const dx = b[0] / b[4] - a[0] / a[4], dy = b[1] / b[4] - a[1] / a[4], l = Math.hypot(dx, dy) || 1;
    return ((b[2] / b[4] - a[2] / a[4]) * dx + (b[3] / b[4] - a[3] / a[4]) * dy) / l;
  }

  private ringOf(i: number): number {
    let n = 1;
    for (let j = this.nxt[i]; j !== i && n < this.cap; j = this.nxt[j]) n++;
    return n;
  }

  private walk(i: number): number[] {
    const out = [i];
    for (let j = this.nxt[i]; j !== i && out.length < this.cap; j = this.nxt[j]) out.push(j);
    return out;
  }

  private polyArea(r: number[]): number {
    let a = 0;
    for (let k = 0; k < r.length; k++) { const i = r[k], j = r[(k + 1) % r.length]; a += this.x[i] * this.y[j] - this.x[j] * this.y[i]; }
    return a / 2;
  }

  /** Rings in skin order, one run of seq per piece. */
  order2(): void {
    let o = 0;
    this.rings = [];
    for (const p of this.pieces) {
      const first = this.order[p.start], start = o;
      let target = 0;
      let i = first;
      do { this.seq[o++] = i; target += this.ash[i]; i = this.nxt[i]; } while (i !== first && o - start <= p.len);
      const r: number[] = Array.from(this.seq.subarray(start, o));
      this.rings.push({ start, len: o - start, area: this.polyArea(r), target });
    }
  }

  protected override weigh(members: number[]): number {
    let a = 0;
    for (const i of members) a += this.ash[i];
    return a;
  }

  protected override stats(): void {
    super.stats();
    // (A ring's points are all at its edge: its radius is the spread's, not √2 times it.)
    for (const p of this.pieces) p.radius /= Math.SQRT2;
  }

  protected override prepare(i: number, _T: number): void {
    const tw = this.tweaks, fz = this.fz[i], rn = this.rn[i], sub = this.sub;
    const per = (k: number) => 1 - Math.pow(1 - Math.min(0.95, k), 1 / sub);
    const tn = this.piece[i] === 0 ? 0.85 * this.tense : 0, rf = rn * (1 - tn);
    this.ks[i] = Math.max(per(0.9) * fz, per(0.6 * (1 - 0.7 * tw.softness) * (1 - 0.75 * rf)));
    this.round[i] = per(0.6 * tw.memory * (1 - rn)) * (1 - fz);
    this.stiff[i] = per(0.85 * fz);
  }

  protected override phase(_p: Piece, _T: number): void {
    if (this.unstick > 0) this.unstick -= 1 / 60;
    this.freezeAll();
  }

  /** Oozing, as in the goo model: his underside creeps a little ahead of him, and he leans that way. */
  protected override crawl(p: Piece, dir: number, ooze: number, m: number, grounded: boolean): void {
    this.tense = dir || (this.input.down ?? 0) > 0.05 ? 0 : Math.min(1, m);
    if (!dir || !ooze) return;
    const target = dir * this.tweaks.speed * 0.6 * Math.min(1, m);
    const foot = dir > 0 ? Math.min(target, Math.max(0, p.vx) + 12) : Math.max(target, Math.min(0, p.vx) - 12);
    for (let k = p.start; k < p.start + p.len; k++) this.tread[this.order[k]] = foot * ooze;
    const dv = target - p.vx;
    if (!grounded || dv * dir <= 0) return;
    const a = Math.min(Math.abs(dv), 260 * ooze * Math.min(1, m) * (1 / 60)) * dir;
    for (let k = p.start; k < p.start + p.len; k++) this.vx[this.order[k]] += a;
  }

  /** Each point of skin stands for several pixels of him: it holds and gives off heat for all of them. */
  protected override heatWeight(i: number): number {
    return Math.max(1, this.ash[i]);
  }

  protected override jumped(): void {
    this.unstick = 0.25;
  }

  protected override rigidMain(): boolean {
    const p = this.pieces[0];
    return !!p && this.frz[this.order[p.start]] === 1;
  }

  /** Rings frozen through hold the shape they froze in; thawed ones let go (as in the goo model). */
  private freezeAll(): void {
    const { order, fz, frz, x, y, rx, ry } = this;
    for (const p of this.pieces) {
      let f = 0, held = 0;
      for (let k = p.start; k < p.start + p.len; k++) { f += fz[order[k]]; held += frz[order[k]]; }
      f /= p.len;
      if (f > 0.5 && held === 0) for (let k = p.start; k < p.start + p.len; k++) { const i = order[k]; frz[i] = 1; rx[i] = x[i] - p.cx; ry[i] = y[i] - p.cy; }
      else if (f < 0.4 && held) for (let k = p.start; k < p.start + p.len; k++) frz[order[k]] = 0;
    }
  }

  // ---- Every substep ----

  protected solve(s: number): void {
    if (s === 0) this.neighbours();
    this.edges();
    this.pressure();
    this.shape();
    this.apart();
    // Last line of defence: a point that's gone anywhere impossible goes back where it was.
    const { x, y, px, py, alive } = this;
    for (let i = 0; i < this.used; i++) if (alive[i] && !(Number.isFinite(x[i]) && Number.isFinite(y[i]))) { x[i] = px[i]; y[i] = py[i]; }
  }

  /**
   * Skin tension: each edge pulls towards its share of the perimeter of a circle of the
   * ring's area. The skin is never slack (slack skin wrinkles and crosses itself): runny Bob
   * just pulls weaker, like a drop with little surface tension, and gravity spreads him.
   */
  private edges(): void {
    const { x, y, ks, seq, nxt } = this;
    for (const r of this.rings) {
      if (r.len < 3) continue;
      const rest = (2 * Math.sqrt(Math.PI * Math.max(1, r.target)) * 1.02) / r.len;
      for (let k = r.start; k < r.start + r.len; k++) {
        const a = seq[k], b = nxt[a];
        const dx = x[b] - x[a], dy = y[b] - y[a], d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        // (Only pulls: a skin under no tension just lies there.)
        if (d <= rest) continue;
        const c = (0.5 * (ks[a] + ks[b]) * (d - rest)) / d / 2;
        x[a] += dx * c; y[a] += dy * c; x[b] -= dx * c; y[b] -= dy * c;
      }
    }
  }

  private tenseOf(r: { start: number }): number {
    return this.piece[this.seq[r.start]] === 0 ? this.tense : 0;
  }

  /** Pressure: each ring keeps its area (position-based area constraint). */
  private pressure(): void {
    const { x, y, seq, nxt, prv, dsx, dsy } = this;
    for (const r of this.rings) {
      if (r.len < 3) continue;
      let A = 0;
      for (let k = r.start; k < r.start + r.len; k++) { const i = seq[k], j = nxt[i]; A += x[i] * y[j] - x[j] * y[i]; }
      A /= 2;
      r.area = A;
      let g2 = 0;
      for (let k = r.start; k < r.start + r.len; k++) {
        const i = seq[k], a = prv[i], b = nxt[i];
        dsx[i] = 0.5 * (y[b] - y[a]); dsy[i] = 0.5 * (x[a] - x[b]);
        g2 += dsx[i] * dsx[i] + dsy[i] * dsy[i];
      }
      // (A ring squashed flat has no area to push with: leave it to the skin and the will to be round.)
      if (g2 < 0.05) continue;
      const lambda = (0.5 * (r.target - A)) / g2;
      for (let k = r.start; k < r.start + r.len; k++) {
        const i = seq[k];
        let dx = lambda * dsx[i], dy = lambda * dsy[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > PUSH_MAX) { dx *= PUSH_MAX / d; dy *= PUSH_MAX / d; }
        x[i] += dx; y[i] += dy;
      }
    }
  }

  /**
   * A will to be round (squashed in the world frame by sagging, winding up and pressing down;
   * flatter for bits he isn't steering), steering each point of his outline towards that
   * ellipse along its direction from his middle; and frozen rings held to their shape. Never
   * moves or spins him.
   */
  private shape(): void {
    const { x, y, seq, round, stiff, frz, rx, ry, dsx, dsy } = this;
    this.rings.forEach((r, pi) => {
      if (r.len < 4) return;
      let cx = 0, cy = 0;
      for (let k = r.start; k < r.start + r.len; k++) { const i = seq[k]; cx += x[i]; cy += y[i]; }
      cx /= r.len; cy /= r.len;
      const p = this.pieces[pi];
      const [ea, eb] = pi === 0 ? [this.sx, this.sy] : this.flat(p);
      const R = Math.sqrt(Math.max(1, r.target) / Math.PI);
      let fr: { cx: number; cy: number; rcx: number; rcy: number; co: number; si: number } | null = null;
      if (frz[seq[r.start]]) {
        let rcx = 0, rcy = 0, a = 0, b = 0, c = 0, d = 0;
        for (let k = r.start; k < r.start + r.len; k++) { const i = seq[k]; rcx += rx[i]; rcy += ry[i]; }
        rcx /= r.len; rcy /= r.len;
        for (let k = r.start; k < r.start + r.len; k++) {
          const i = seq[k], ox = x[i] - cx, oy = y[i] - cy, qx = rx[i] - rcx, qy = ry[i] - rcy;
          a += ox * qx; b += ox * qy; c += oy * qx; d += oy * qy;
        }
        const th = Math.atan2(c - b, a + d);
        fr = { cx, cy, rcx, rcy, co: Math.cos(th), si: Math.sin(th) };
      }
      let mx = 0, my = 0;
      for (let k = r.start; k < r.start + r.len; k++) {
        const i = seq[k], ox = x[i] - cx, oy = y[i] - cy;
        let gx = 0, gy = 0;
        if (round[i] > 0) {
          const e = Math.sqrt(ox * ox + oy * oy) || 1e-6, c = ox / e / ea, s = oy / e / eb, want = R / Math.sqrt(c * c + s * s);
          const sc = (Math.min(RATIO, Math.max(1 / RATIO, want / e)) - 1) * round[i];
          gx = ox * sc; gy = oy * sc;
          const gl = Math.sqrt(gx * gx + gy * gy);
          if (gl > ROUND_MAX) { gx *= ROUND_MAX / gl; gy *= ROUND_MAX / gl; }
        }
        if (fr && frz[i]) {
          const qx = rx[i] - fr.rcx, qy = ry[i] - fr.rcy;
          gx += (fr.cx + fr.co * qx - fr.si * qy - x[i]) * stiff[i];
          gy += (fr.cy + fr.si * qx + fr.co * qy - y[i]) * stiff[i];
        }
        dsx[i] = gx; dsy[i] = gy; mx += gx; my += gy;
      }
      mx /= r.len; my /= r.len;
      let tq = 0, inertia = 0;
      for (let k = r.start; k < r.start + r.len; k++) {
        const i = seq[k], ox = x[i] - cx, oy = y[i] - cy;
        dsx[i] -= mx; dsy[i] -= my;
        tq += ox * dsy[i] - oy * dsx[i]; inertia += ox * ox + oy * oy;
      }
      const spin = inertia > 0 ? tq / inertia : 0;
      for (let k = r.start; k < r.start + r.len; k++) {
        const i = seq[k], ox = x[i] - cx, oy = y[i] - cy;
        x[i] += dsx[i] + spin * oy; y[i] += dsy[i] - spin * ox;
      }
    });
  }

  /** Bits he isn't steering slump, as far as cohesion lets them. */
  private flat(p: Piece): [number, number] {
    const rn = Math.min(1, Math.max(0, (p.temp - 35) / 25));
    const a = Math.max(0.3, (0.5 + 0.45 * this.tweaks.cohesion) * (1 - 0.4 * rn));
    return [1 / a, a];
  }

  /** Points of skin within reach of each other (any ring), found once a step. */
  private neighbours(): void {
    const { x, y, alive, head, next } = this, w = this.ww, hh = head.length / w;
    const cells: number[] = [];
    const cellX = (v: number) => Math.min(w - 1, Math.max(0, Math.floor(v))), cellY = (v: number) => Math.min(hh - 1, Math.max(0, Math.floor(v)));
    for (let i = 0; i < this.used; i++) {
      if (!alive[i]) continue;
      const c = cellY(y[i]) * w + cellX(x[i]);
      if (head[c] === -1) cells.push(c);
      next[i] = head[c];
      head[c] = i;
    }
    let np = 0;
    const { pa, pb } = this, max = pa.length;
    for (let i = 0; i < this.used; i++) {
      if (!alive[i]) continue;
      const cx = cellX(x[i]), cy = cellY(y[i]);
      for (let oy = -2; oy <= 2; oy++)
        for (let ox = -2; ox <= 2; ox++) {
          const qx = cx + ox, qy = cy + oy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= hh) continue;
          for (let j = head[qy * w + qx]; j >= 0; j = next[j]) {
            if (j <= i || this.near(i, j)) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            if (dx * dx + dy * dy < 4 && np < max) { pa[np] = i; pb[np] = j; np++; }
          }
        }
    }
    this.np = np;
    for (const c of cells) head[c] = -1;
  }

  /** Within a few points of each other along the same skin (that's one patch of skin, not two touching). */
  private near(i: number, j: number): boolean {
    const { nxt, prv } = this;
    let a = i, b = i;
    for (let k = 0; k < NEAR; k++) { a = nxt[a]; b = prv[b]; if (a === j || b === j) return true; }
    return false;
  }

  /**
   * Skin never passes through skin: points that aren't neighbours along it keep apart, from
   * each other and from each other's edges (so an edge can't slip between two points).
   */
  private apart(): void {
    const { pa, pb } = this;
    for (let k = 0; k < this.np; k++) {
      const i = pa[k], j = pb[k];
      this.off(i, j, this.nxt[j]);
      this.off(j, i, this.nxt[i]);
    }
  }

  /** Push point i off the edge a–b (and the edge off it) if it's closer than APART. */
  private off(i: number, a: number, b: number): void {
    const { x, y, piece, fsx, fsy } = this;
    if (i === a || i === b || this.near(i, a) && this.near(i, b)) return;
    const ex = x[b] - x[a], ey = y[b] - y[a], e2 = ex * ex + ey * ey;
    const u = e2 > 1e-9 ? Math.max(0, Math.min(1, ((x[i] - x[a]) * ex + (y[i] - y[a]) * ey) / e2)) : 0;
    let dx = x[i] - (x[a] + ex * u), dy = y[i] - (y[a] + ey * u);
    const d2 = dx * dx + dy * dy;
    if (d2 >= APART * APART) return;
    const d = Math.sqrt(d2);
    if (d < 1e-4) { dx = -ey; dy = ex; const l = Math.sqrt(dx * dx + dy * dy) || 1; dx /= l; dy /= l; } else { dx /= d; dy /= d; }
    const c = (APART - d) * 0.5;
    x[i] += dx * c; y[i] += dy * c;
    x[a] -= dx * c * (1 - u); y[a] -= dy * c * (1 - u); x[b] -= dx * c * u; y[b] -= dy * c * u;
    if (piece[i] !== piece[a]) {
      fsx[i] += dx * c; fsy[i] += dy * c;
      fsx[a] -= dx * c * (1 - u); fsy[a] -= dy * c * (1 - u); fsx[b] -= dx * c * u; fsy[b] -= dy * c * u;
    }
  }

  protected override stick(world: World, i: number, nx: number, ny: number): void {
    const r = Math.max(0, (this.rn[i] - 0.5) / 0.5);
    if (r > 0 && this.unstick <= 0) {
      const x0 = nx, y0 = ny;
      const cx = Math.floor(nx), cy = Math.floor(ny), a = ADHESION * r, grip = HOLD * r * this.h * this.h;
      const fx = nx - cx, fy = ny - cy;
      const pull = (d: number) => Math.max(-grip, Math.min(grip, d * a));
      if (fy > 1 - TOUCH && this.solid(world, cx, cy + 1)) { ny += pull(cy + 1 - 0.02 - ny); const tr = this.tread[i] * this.h; nx = this.px[i] + tr + (nx - this.px[i] - tr) * (1 - FLOOR_DRAG * r); }
      if (fy < TOUCH && this.solid(world, cx, cy - 1)) { ny += pull(cy + 0.02 - ny); nx = this.px[i] + (nx - this.px[i]) * (1 - 0.3 * r); }
      if (this.solid(world, Math.floor(nx), Math.floor(ny))) { nx = x0; ny = y0; }
    }
    this.qx = nx; this.qy = ny;
  }

  // ---- Topology ----

  /** A spike or a crack slices the ring: the first two edges crossing the cut are rejoined across it. */
  protected override cut(p: number, ox: number, oy: number, dx: number, dy: number, len: number): void {
    const r = this.rings[p];
    if (!r || r.len < 8) return;
    const { x, y, seq, nxt } = this, hits: number[] = [];
    for (let k = r.start; k < r.start + r.len && hits.length < 2; k++) {
      const a = seq[k], b = nxt[a];
      const sa = (x[a] - ox) * dy - (y[a] - oy) * dx, sb = (x[b] - ox) * dy - (y[b] - oy) * dx;
      if ((sa < 0) === (sb < 0)) continue;
      const along = ((x[a] + x[b]) / 2 - ox) * dx + ((y[a] + y[b]) / 2 - oy) * dy;
      if (Math.abs(along) <= len) hits.push(a);
    }
    if (hits.length < 2 || !this.split(hits[0], hits[1])) return;
    for (const i of [hits[0], hits[1], nxt[hits[0]], nxt[hits[1]]]) this.cool[i] = 0.6;
    this.order2();
  }

  /** A hard knock splashes off a droplet: a little loop of skin pinched off where it hit. */
  protected override tear(i: number): void {
    if (!this.alive[i] || this.ringOf(i) < 16) return;
    const a = this.prv[i];
    let b = i;
    for (let k = 0; k < 3; k++) b = this.nxt[b];
    if (this.split(a, b)) { this.cool[i] = this.cool[a] = this.cool[b] = 0.6; this.order2(); }
  }

  protected override kill(i: number, why: keyof Losses): void {
    if (!this.alive[i]) return;
    const n = this.ringOf(i);
    if (n <= 3) {
      // The last of a droplet: all of it goes.
      for (const j of this.walk(i)) { this.lost[why] += this.ash[j]; this.unlink(j, this.nxt[j]); this.losses[why]++; this.drop(j); }
      this.dirty = true;
      return;
    }
    const a = this.prv[i], b = this.nxt[i];
    this.lost[why] += this.ash[i];
    this.losses[why]++;
    this.unlink(a, i); this.unlink(i, b);
    this.nxt[a] = b; this.prv[b] = a;
    this.link(a, b);
    this.drop(i);
    this.dirty = true;
  }

  /**
   * After heat: his inside evens his temperature out (heat crosses him, not just along his
   * skin); the skin is re-spaced; thin runny necks pinch off; touching rings join.
   */
  protected override merge(): void {
    const { t, seq, alive, x, y, nxt, prv, piece, fz, rn, cool, pa, pb } = this;
    for (const r of this.rings) {
      let m = 0;
      for (let k = r.start; k < r.start + r.len; k++) m += t[seq[k]];
      m /= r.len;
      for (let k = r.start; k < r.start + r.len; k++) t[seq[k]] += (m - t[seq[k]]) * 0.06;
    }
    let changed = false;
    // Re-space: a point added in a long edge, one taken out of a short one (not while frozen).
    for (let i = 0; i < this.used; i++) {
      if (!alive[i] || this.frz[i]) continue;
      const j = nxt[i], d = Math.hypot(x[j] - x[i], y[j] - y[i]);
      if (d > SPLIT && this.ringOf(i) < this.maxPoints(i)) {
        const m = this.take();
        if (m < 0) continue;
        x[m] = this.px[m] = (x[i] + x[j]) / 2; y[m] = this.py[m] = (y[i] + y[j]) / 2;
        this.vx[m] = (this.vx[i] + this.vx[j]) / 2; this.vy[m] = (this.vy[i] + this.vy[j]) / 2;
        t[m] = (t[i] + t[j]) / 2; fz[m] = (fz[i] + fz[j]) / 2; rn[m] = (rn[i] + rn[j]) / 2; piece[m] = piece[i];
        this.ash[m] = this.ash[i] / 2; this.ash[i] /= 2;
        this.unlink(i, j); nxt[i] = m; prv[m] = i; nxt[m] = j; prv[j] = m; this.link(i, m); this.link(m, j);
        changed = true;
      } else if (d < JOIN && this.ringOf(i) > 6 && !this.frz[j]) {
        const k = nxt[j];
        this.ash[i] += this.ash[j];
        this.unlink(i, j); this.unlink(j, k); nxt[i] = k; prv[k] = i; this.link(i, k);
        this.drop(j);
        changed = true;
      }
    }
    // Pinch: two points of a runny ring that have come together across a thin neck.
    // Join: two rings touching.
    const joined = new Set<number>();
    for (let k = 0; k < this.np; k++) {
      const i = pa[k], j = pb[k];
      if (!alive[i] || !alive[j] || cool[i] > 0 || cool[j] > 0 || joined.has(piece[i]) || joined.has(piece[j])) continue;
      const d = Math.hypot(x[j] - x[i], y[j] - y[i]);
      // Which side of each other they're on: the skin's outward direction at each point.
      const nix = y[nxt[i]] - y[prv[i]], niy = x[prv[i]] - x[nxt[i]], njx = y[nxt[j]] - y[prv[j]], njy = x[prv[j]] - x[nxt[j]];
      const ji = (x[j] - x[i]) * nix + (y[j] - y[i]) * niy, ij = (x[i] - x[j]) * njx + (y[i] - y[j]) * njy;
      if (piece[i] === piece[j]) {
        // A neck pinching: the two sides meet from inside him (each is inward of the other).
        // (Skin folded against itself from outside isn't a neck.)
        if (d > PINCH || ji >= 0 || ij >= 0 || rn[i] < 0.5 || rn[j] < 0.5 || this.along(i, j, PINCH_GAP) >= 0 || this.along(j, i, PINCH_GAP) >= 0) continue;
        // ...and only when the two sides are pulling apart (a drop falling away from what holds
        // it), not when he's just squeezing through somewhere narrow, all moving together.
        if (this.parting(i, j) < PART) continue;
        if (this.split(i, j)) { joined.add(piece[i]); changed = true; cool[i] = cool[j] = 0.3; }
      } else if (d < JOIN_R && ji > 0 && ij > 0 && this.rand() < JOIN_CHANCE * this.tweaks.cohesion && fz[i] < 0.5 && fz[j] < 0.5 && !this.frz[i] && !this.frz[j]) {
        // Splice them, unless the one ring that makes isn't about the area of the two (the
        // splice crossed the skin: undo it).
        const before = Math.abs(this.polyArea(this.walk(i))) + Math.abs(this.polyArea(this.walk(j)));
        this.swap(i, j);
        if (this.polyArea(this.walk(i)) < before * 0.8) { this.swap(i, j); continue; }
        joined.add(piece[i]); joined.add(piece[j]);
        this.breaks.merge++;
        changed = true;
      }
    }
    if (changed) this.dirty = true;
  }

  protected override relax(): void {
    this.order2();
  }

  override shift(dx: number, dy: number): void {
    super.shift(dx, dy);
  }
}

/**
 * Bob model 3, "skin" (docs/09-bob-models.md): a ring of points, his skin, holding a
 * pressure inside (as in Gish or LocoRoco). Round and bouncy by nature; rolling is his skin
 * running round like a tread. Liquid things are explicit cuts and joins of the ring.
 * What you see and what counts is the area inside the rings, one point per pixel.
 */
export class Skin implements BobModel {
  readonly kind: ModelKind = "skin";
  private rings: Rings;
  pieces: Piece[] = [];
  count = 0;
  total = 0;
  private fx = new Float32Array(0);
  private fy = new Float32Array(0);
  private fvx = new Float32Array(0);
  private fvy = new Float32Array(0);
  private ft = new Float32Array(0);
  private forder = new Int32Array(0);
  private n = 0;

  constructor(tweaks: Tweaks = DEFAULTS, seed = 1) {
    this.rings = new Rings(tweaks, seed);
  }

  get tweaks(): Tweaks { return this.rings.tweaks; }
  set tweaks(t: Tweaks) { this.rings.tweaks = t; }
  get fixedTemp(): number | null { return this.rings.fixedTemp; }
  set fixedTemp(t: number | null) { this.rings.fixedTemp = t; }
  get facing(): number { return this.rings.facing; }
  set facing(f: number) { this.rings.facing = f; }
  get losses(): Losses {
    const l = this.rings.lost;
    return { boiled: Math.round(l.boiled), dissolved: Math.round(l.dissolved), crushed: Math.round(l.crushed), fell: Math.round(l.fell) };
  }
  set losses(_l: Losses) {}
  get main(): Piece | undefined { return this.pieces[0]; }

  spawn(world: World, cx: number, cy: number, temp = 20, bits: { x: number; y: number; r: number }[] = []): void {
    this.total = this.rings.spawnRings(world, [{ x: cx, y: cy, r: this.tweaks.size }, ...bits], temp);
    this.n = 0;
    this.grow(this.total * 3);
    this.fill();
  }

  step(world: World, input: Input): void {
    if (!this.rings.count) return;
    this.rings.step(world, input);
    this.fill();
  }

  shift(dx: number, dy: number): void {
    this.rings.shift(dx, dy);
    this.fill();
  }

  countIn(x0: number, y0: number, x1: number, y1: number): number {
    let c = 0;
    for (let k = 0; k < this.n; k++) if (this.fx[k] >= x0 && this.fx[k] < x1 && this.fy[k] >= y0 && this.fy[k] < y1) c++;
    return c;
  }

  view(): BobView {
    return { x: this.fx, y: this.fy, vx: this.fvx, vy: this.fvy, t: this.ft, order: this.forder, pieces: this.pieces, fixedTemp: this.fixedTemp, facing: this.facing };
  }

  private grow(m: number): void {
    this.fx = new Float32Array(m); this.fy = new Float32Array(m); this.fvx = new Float32Array(m); this.fvy = new Float32Array(m);
    this.ft = new Float32Array(m); this.forder = new Int32Array(m);
  }

  /**
   * The inside of each ring, one point per pixel centre (scanlines across the polygon), with
   * temperature and velocity taken from the skin either side.
   */
  private fill(): void {
    // (Room for his whole area many times over; grown if he ever needs more.)
    if (this.fx.length < this.total * 2 || this.n > this.fx.length * 0.8) this.grow(Math.max(this.total * 3, this.fx.length * 2));
    const R = this.rings, { x, y, t, vx, vy, seq } = R;
    let n = 0, alive = 0;
    this.pieces = [];
    const xs: number[] = [], vs: number[][] = [];
    R.rings.forEach((r, pi) => {
      const bp = R.pieces[pi];
      const start = n;
      alive += r.target;
      let y0 = Infinity, y1 = -Infinity;
      for (let k = r.start; k < r.start + r.len; k++) { y0 = Math.min(y0, y[seq[k]]); y1 = Math.max(y1, y[seq[k]]); }
      for (let row = Math.floor(y0); row <= Math.ceil(y1); row++) {
        const sy = row + 0.5;
        xs.length = 0; vs.length = 0;
        for (let k = r.start; k < r.start + r.len; k++) {
          const a = seq[k], b = seq[k + 1 < r.start + r.len ? k + 1 : r.start];
          if ((y[a] <= sy) === (y[b] <= sy)) continue;
          const f = (sy - y[a]) / (y[b] - y[a]);
          xs.push(x[a] + (x[b] - x[a]) * f);
          vs.push([t[a] + (t[b] - t[a]) * f, vx[a] + (vx[b] - vx[a]) * f, vy[a] + (vy[b] - vy[a]) * f]);
        }
        const idx = xs.map((_, k) => k).sort((p, q) => xs[p] - xs[q]);
        for (let k = 0; k + 1 < idx.length; k += 2) {
          const a = idx[k], b = idx[k + 1], xa = xs[a], xb = xs[b];
          for (let col = Math.ceil(xa - 0.5); col + 0.5 <= xb && n < this.fx.length; col++) {
            const f = xb > xa ? (col + 0.5 - xa) / (xb - xa) : 0;
            this.fx[n] = col + 0.5; this.fy[n] = sy;
            this.ft[n] = vs[a][0] + (vs[b][0] - vs[a][0]) * f;
            this.fvx[n] = vs[a][1] + (vs[b][1] - vs[a][1]) * f; this.fvy[n] = vs[a][2] + (vs[b][2] - vs[a][2]) * f;
            this.forder[n] = n;
            n++;
          }
        }
      }
      if (n === start && n < this.fx.length) {
        // A droplet too thin to cover a pixel centre still shows as one.
        this.fx[n] = bp.cx; this.fy[n] = bp.cy; this.ft[n] = bp.temp; this.fvx[n] = bp.vx; this.fvy[n] = bp.vy; this.forder[n] = n; n++;
      }
      this.pieces.push({ ...bp, start, len: n - start });
    });
    this.n = n;
    this.count = Math.round(alive);
  }
}
