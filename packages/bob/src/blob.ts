import type { World } from "@pixelbob/sim";
import { Body, NB } from "./body.ts";
import type { Piece } from "./model.ts";
import { DEFAULTS, frozenness, runniness, type Tweaks } from "./tweaks.ts";

export type { Input, Piece } from "./model.ts";

/** Particles closer than this push apart. */
const R0 = 0.85;
/** Runny stickiness: pull per substep back to where a particle holds on, and how far it stretches before letting go. */
const ADHESION = 0.3;
const ADH_BREAK = 2;
/** Runny bonds stretch (taffy) up to this length; beyond it they tear, so a heavy dangling bit pulls off. */
const TAFFY_MAX = 2.4;

/**
 * Bob model 1, "lattice" (docs/08-bob.md, docs/09-bob-models.md): one particle per pixel of
 * his body, joined to neighbours by bonds (XPBD distance constraints that break when
 * overstretched) and pulled towards a remembered rest shape by shape matching. He's a
 * solid at heart: runny, frozen and re-formed states swap his rest shape for a new one.
 */
export class Lattice extends Body {
  readonly kind = "lattice";
  /** Rest offset from the piece's centre (shape matching target), and the round shape it relaxes to. */
  rx = new Float32Array(0); ry = new Float32Array(0);
  hx = new Float32Array(0); hy = new Float32Array(0);
  private al = new Float32Array(0);
  /** Where a sticky (runny) particle is holding on to a surface. */
  private anch = new Uint8Array(0);
  private ax = new Float32Array(0);
  private ay = new Float32Array(0);
  /** Which way the held surface is from the hold point (one of the four neighbours). */
  private asx = new Int8Array(0);
  private asy = new Int8Array(0);
  /** Shape-matching pull per particle, before taking out net shift and spin. */
  private dsx = new Float32Array(0);
  private dsy = new Float32Array(0);
  /** The main piece is frozen rigid. */
  private rigid = false;
  /** The main piece has been runny (and not set again since). */
  private melted = false;
  private mergeA: number[] = [];
  private mergeB: number[] = [];

  constructor(tweaks: Tweaks = DEFAULTS, seed = 1) {
    super(tweaks, seed, 10);
  }

  protected alloc(cap: number): void {
    const f = () => new Float32Array(cap);
    this.rx = f(); this.ry = f(); this.hx = f(); this.hy = f(); this.al = f(); this.ax = f(); this.ay = f(); this.dsx = f(); this.dsy = f();
    this.anch = new Uint8Array(cap); this.asx = new Int8Array(cap); this.asy = new Int8Array(cap);
  }

  protected override spawned(i: number, dx: number, dy: number): void {
    this.rx[i] = this.hx[i] = dx;
    this.ry[i] = this.hy[i] = dy;
  }

  protected override reset(): void {
    this.rigid = this.melted = false;
  }

  protected override prepare(i: number, _T: number): void {
    // Shape memory per substep: frozen is rigid; runny barely keeps a shape.
    const tw = this.tweaks;
    const mem = Math.max(tw.memory * tw.memory * 0.5 * (1 - 0.92 * this.rn[i]), 0.85 * this.fz[i]);
    this.al[i] = 1 - Math.pow(1 - mem, 1 / this.sub);
  }

  protected solve(s: number): void {
    const tw = this.tweaks;
    this.shapeMatch();
    this.solveBonds(60 * tw.softness * tw.softness, s === this.sub - 1);
    this.separate(s === this.sub - 1);
  }

  protected override phase(p: Piece, T: number): void {
    // Freezing sets him rigid in his current shape: his squash stops being applied in
    // world space (or a rolling frozen dome would be forced to change shape every frame).
    const fzP = frozenness(T);
    if (!this.rigid && fzP > 0.5) { this.rigid = true; this.reshapePiece(p); }
    else if (this.rigid && fzP < 0.4) { this.rigid = false; this.sag = 0; this.reshapePiece(p); }
    // Runny, his particles flow and swap neighbours, so their old places in his round shape no
    // longer make sense: setting again, he takes the shape he's in as a fresh start and rounds
    // up from there (otherwise he'd stay lumpy, particles unable to pass each other).
    const rnP = runniness(T);
    if (!this.melted && rnP > 0.7) this.melted = true;
    else if (this.melted && rnP < 0.5) { this.melted = false; this.reform(p); }
  }

  protected override rigidMain(): boolean {
    return this.rigid;
  }

  protected override jumped(p: Piece): void {
    for (let k = p.start; k < p.start + p.len; k++) this.anch[this.order[k]] = 0;
  }

  protected override changed(members: number[], pi: number): void {
    // Every piece's target is squashed (see squash()): undo that so it starts where it is.
    let tt = 0;
    for (const i of members) tt += this.t[i];
    const [sx, sy] = this.squash(pi, this.fixedTemp ?? tt / members.length);
    this.reshape(members, sx, sy);
  }

  /**
   * Runny Bob is sticky, like honey: where he touches a surface he holds on, a little.
   * Pulled more than ADH_BREAK away (weight hanging below, a jump), he lets go; crawling
   * drags his hold along with him. So he can ooze over an edge and dangle down.
   * Only properly runny Bob is sticky: a merely warm one is still firm, and holding on
   * while firm would prop him out over an edge like a beam.
   */
  protected override stick(world: World, i: number, nx: number, ny: number): void {
    const { cnx, cny } = this, H = this.h;
    const r = Math.max(0, (this.rn[i] - 0.6) / 0.4);
    if (r > 0) {
      if (this.anch[i]) {
        // Like honey: it sticks against being pulled off the surface, but still flows along
        // it, so the hold creeps with him (and with his crawling).
        const ux = -this.asx[i], uy = -this.asy[i];
        let dx = this.ax[i] - nx, dy = this.ay[i] - ny;
        const along = dx * uy - dy * ux;
        this.ax[i] -= uy * along * 0.05 - this.tread[i] * H; this.ay[i] += ux * along * 0.05;
        dx = this.ax[i] - nx; dy = this.ay[i] - ny;
        const off = -(dx * ux + dy * uy), side = dx * uy - dy * ux;
        // Let go if pulled too far off the surface, or if the surface it holds isn't there
        // any more (crept past an edge, or dug away).
        const sx = Math.floor(this.ax[i]) + this.asx[i], sy = Math.floor(this.ay[i]) + this.asy[i];
        if (off > ADH_BREAK || !this.solid(world, sx, sy)) this.anch[i] = 0;
        else {
          const pull = Math.max(0, off) * ADHESION * r, drag = side * ADHESION * r * 1;
          nx -= ux * pull - uy * drag; ny -= uy * pull + ux * drag;
        }
      } else if (cnx[i] || cny[i]) {
        // The surface is on the far side from the contact normal.
        this.anch[i] = 1; this.ax[i] = nx; this.ay[i] = ny;
        this.asx[i] = Math.abs(cnx[i]) >= Math.abs(cny[i]) ? -Math.sign(cnx[i]) : 0;
        this.asy[i] = Math.abs(cnx[i]) >= Math.abs(cny[i]) ? 0 : -Math.sign(cny[i]);
      }
    } else this.anch[i] = 0;
    this.qx = nx; this.qy = ny;
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
      const limit = breakBase * (1 + r);
      // Only judged once a step, so a hard landing's momentary squeeze doesn't count.
      if (breaking && strain > limit) { this.breaks.strain++; this.unbond(k); this.cool[a] = this.cool[b] = 0.3 * (1 - r); continue; }
      const alpha = soft * (1 + 20 * r);
      const corr = (len - bl[k]) / (2 + alpha) / len;
      x[a] += dx * corr; y[a] += dy * corr;
      x[b] -= dx * corr; y[b] -= dy * corr;
      // Freezing sets him in whatever shape he is in.
      if (f > 0) bl[k] += (len - bl[k]) * f * 0.05;
      // Runny Bob is taffy: bonds take on whatever length they're pulled to, so he pours and stays poured.
      else if (r > 0) bl[k] = Math.max(0.6, Math.min(TAFFY_MAX * (1 + 3 * this.pouring), bl[k] + (len - bl[k]) * r * 0.05));
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

  /** Touching pieces rejoin (how readily depends on cohesion). */
  protected override merge(): void {
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

  /** Rest shapes slowly round off again (not while frozen: shards keep their shape). */
  protected override relax(): void {
    const { rx, ry, hx, hy, alive, fz } = this;
    for (let i = 0; i < this.cap; i++) {
      if (!alive[i]) continue;
      const k = 0.05 * (1 - fz[i]);
      rx[i] += (hx[i] - rx[i]) * k; ry[i] += (hy[i] - ry[i]) * k;
    }
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

  /**
   * Rebuild a piece like a newly made Bob: every particle takes a place in an evenly spaced
   * round grid near where it is now (neighbours stay neighbours), remembers that as its rest
   * shape straight away, and bonds to its grid neighbours. Used when he sets again after being
   * runny: by then his bonds have stretched and re-formed all over and his particles have
   * swapped places, so his old structure would hold him in a lump instead of pulling him round.
   */
  private reform(p: Piece): void {
    const members = Array.from(this.order.subarray(p.start, p.start + p.len)), pi = this.piece[members[0]];
    this.reshape(members, 1, 1, true);
    const { rx, ry, hx, hy } = this, at = new Map<number, number>(), key = (gx: number, gy: number) => (gy + 512) * 1024 + gx + 512;
    for (const i of members) { rx[i] = hx[i]; ry[i] = hy[i]; at.set(key(Math.round(hx[i] * 2), Math.round(hy[i] * 2)), i); }
    for (let k = this.nb - 1; k >= 0; k--) if (this.piece[this.ba[k]] === pi) this.unbond(k);
    for (const i of members)
      for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const j = at.get(key(Math.round((hx[i] + ox) * 2), Math.round((hy[i] + oy) * 2)));
        if (j !== undefined) this.bond(i, j, Math.hypot(ox, oy));
      }
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
}

/** The original name of the lattice model. */
export { Lattice as Blob };
