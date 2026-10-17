import { TACK, type World } from "@pixelbob/sim";
import { Body, NB } from "./body.ts";
import type { Piece } from "./model.ts";
import { DEFAULTS, type Tweaks } from "./tweaks.ts";

/** Neighbours closer than this push and pull on each other (px). */
const RH = 3;
/** How hard he resists squeezing and stretching his volume, and keeps particles apart up close. */
const KP = 0.05;
const KN = 0.1;
/**
 * Rest density, worked out so a grid of particles one pixel apart is at rest: with the
 * near-pressure always pushing, the pressure there has to pull just as hard.
 */
const RHO0 = (() => {
  let rho = 0, rhoN = 0, a = 0, b = 0;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const r = Math.hypot(dx, dy), q = 1 - r / RH;
      if (!r || q <= 0) continue;
      rho += q * q; rhoN += q * q * q; a += q * r; b += q * q * r;
    }
  return rho + (KN * rhoN * b) / (KP * a);
})();
/** Fastest his will to be round moves a particle, px per substep. */
const ROUND_MAX = 0.05;
/** Most his outline is scaled towards round in a substep, either way. */
const RATIO = 1.25;
/** A particle this sparse (of the rest density) inside his outline is at the edge of a hole; how fast it closes (px per substep). */
const HOLE_RHO = 0.6;
const HOLE_PULL = 0.04;
/** Directions his outline is measured in. */
const BINS = 24;
/** Particles never get closer than this. */
const RMIN = 0.6;
/** Neighbours this close link up with a spring, if they aren't linked yet. */
const LINK_R = 1.5;
/** Separate pieces this close join up. */
const JOIN_R = 2.1;
/** A spring that has flowed (plastically) longer than this lets go. */
const LINK_MAX = 2.6;
/** Runny, a sudden stretch tears a link this much more easily (a thread holds a slow pull, not a yank). */
const THREAD = 0.75;
const TEAR_MIN = 0.4;
/** How far a spring stretches or squeezes before it starts to flow (fraction of its length). */
const YIELD = 0.1;
/** At most this many new links between separate pieces per step: bits join on smoothly. */
const JOIN_MAX = 8;
/** Runny stickiness: pull towards a surface he's touching, per substep. */
const ADHESION = 0.35;
/** How close to a face counts as touching it. */
const TOUCH = 0.35;
/** Strongest pull a sticky particle holds on with (px/s²): a few times its weight. */
const HOLD = 1500;
/** Honey doesn't slide on a floor: its underside drags (it still flows above that). */
const FLOOR_DRAG = 0.3;
const WALL_DRAG = 0.05;
/** How much a tacky surface (at full tack) stops him sliding along it, per substep. */
const GRIP = 0.6;
/** How hard a tacky surface (at full tack) holds on, px/s², and how fast he climbs one (x his speed). */
const TACK_HOLD = 8000;
const CLIMB = 0.6;
/** Leaning into a tacky surface he's climbing (px/s²), up to this speed towards it. */
const HUG = 300;
const HUG_SPEED = 15;
/** How far ahead of the rest of him his underside may creep when oozing (px/s). */
const FOOT_LEAD = 12;
/** How much a runny Bob holding still firms himself up (0..1). */
const TENSE = 0.85;

/**
 * Bob model 2, "goo" (docs/09-bob-models.md): a viscoelastic fluid. Particles push and pull
 * on every neighbour within reach (a pressure that keeps his volume and draws his surface
 * in, which is surface tension), and neighbours are linked by springs that flow when held
 * stretched (plasticity) and form and break as particles move. Temperature turns the knobs
 * continuously:
 *   - frozen: stiff springs that never flow, held to the shape he froze in;
 *   - normal: springy jelly that slowly forgets any dent, kept round by his will to be round;
 *   - runny: springs flow freely and he hardly tries to be round: a sticky, stringy honey
 *     that drips, dangles in threads and pours.
 * Nothing about him is ever swapped for a new shape, so nothing jumps when he melts, sets,
 * splits or picks up a bit.
 */
export class Goo extends Body {
  readonly kind = "goo";
  /** Rest offsets (from the piece's middle) frozen particles are held to. */
  private rx = new Float32Array(0);
  private ry = new Float32Array(0);
  private frz = new Uint8Array(0);
  /** Per-step stiffnesses from temperature. */
  private ks = new Float32Array(0);
  private flow = new Float32Array(0);
  private creep = new Float32Array(0);
  private round = new Float32Array(0);
  private visc = new Float32Array(0);
  private stiff = new Float32Array(0);
  private rho = new Float32Array(0);
  private rhoN = new Float32Array(0);
  /** Neighbour density last substep (low at a surface). */
  private dens = new Float32Array(0);
  private ext = new Float32Array(BINS);
  private dsx = new Float32Array(0);
  private dsy = new Float32Array(0);
  /** Neighbour pairs this substep. */
  private pa = new Int32Array(0);
  private pb = new Int32Array(0);
  private np = 0;
  /** Of those, the ones within reach this substep: ends, closeness (1 - r/RH), direction. */
  private ca = new Int32Array(0);
  private cb = new Int32Array(0);
  private cq = new Float32Array(0);
  private cux = new Float32Array(0);
  private cuy = new Float32Array(0);
  private nc = 0;
  /** Links per particle (rebuilt each step, for "already linked?"). */
  private adj = new Int32Array(0);
  private adjN = new Uint8Array(0);
  /** The player isn't steering: runny Bob holds himself together instead of flowing (0..1). */
  private tense = 0;
  /** Particles of the piece he's steering clinging to something tacky, last step. */
  private cling = 0;
  private clung = 0;
  /** Seconds before runny Bob sticks again (just jumped off). */
  private unstick = 0;

  constructor(tweaks: Tweaks = DEFAULTS, seed = 1) {
    super(tweaks, seed, 6);
    this.relRunny = 0;
    // (Runny, gravity and surface tension decide how he puddles, not his will.)
    this.sagRunny = 0.6;
    // (A jelly that shifts its weight as it turns needs more effort to roll than a firm one.)
    this.rollGain = 2;
    this.settleRate = 0.4;
    this.keepControl = true;
    this.pourGain = 0.3;
  }

  protected alloc(cap: number): void {
    const f = () => new Float32Array(cap);
    this.rx = f(); this.ry = f(); this.frz = new Uint8Array(cap);
    this.ks = f(); this.flow = f(); this.creep = f(); this.round = f(); this.visc = f(); this.stiff = f();
    this.rho = f(); this.rhoN = f(); this.dens = f(); this.dsx = f(); this.dsy = f();
    this.pa = new Int32Array(cap * 40); this.pb = new Int32Array(cap * 40);
    this.ca = new Int32Array(cap * 40); this.cb = new Int32Array(cap * 40); this.cq = new Float32Array(cap * 40); this.cux = new Float32Array(cap * 40); this.cuy = new Float32Array(cap * 40);
    this.adj = new Int32Array(cap * NB); this.adjN = new Uint8Array(cap);
  }

  protected override reset(): void {
    this.unstick = 0;
  }

  protected override prepare(i: number, _T: number): void {
    const tw = this.tweaks, fz = this.fz[i], rn = this.rn[i], sub = this.sub;
    const per = (k: number) => 1 - Math.pow(1 - Math.min(0.95, k), 1 / sub);
    // Spring stiffness: jelly normally (softness makes him wobblier), barely any when runny,
    // rigid when frozen.
    const jelly = 0.5 * (1 - 0.85 * tw.softness);
    // Runny and holding still (not steering), he tenses up: stiffer, flowing much less, so he
    // can hang off a ledge without draining over it. (Only the piece he's steering.)
    const tn = this.piece[i] === 0 ? TENSE * this.tense : 0, rf = rn * (1 - tn);
    this.ks[i] = Math.max(per(0.9) * fz, per(jelly * (1 - 0.92 * rf)));
    // How fast held stretch turns into a new shape (per second): frozen never, normal Bob
    // slowly forgets a dent (less with more memory), runny flows.
    this.flow[i] = (1 - fz) * (1.5 * (1 - tw.memory) + 5 * rf);
    // Below the yield, stress still fades, over a couple of seconds (never when frozen).
    this.creep[i] = 0.5 * (1 - fz) * (1 - tn * rn);
    // His will to be round: memory, and gone when runny or frozen.
    this.round[i] = per(tw.memory * (1 - rn)) * (1 - fz);
    // Runny honey is thick: neighbours drag each other along (threads, not splashes).
    this.visc[i] = (0.15 + 0.45 * tw.stringy) * rn;
    // Held to his frozen shape.
    this.stiff[i] = per(0.85 * fz);
  }

  protected override phase(p: Piece, _T: number): void {
    if (this.unstick > 0) this.unstick -= 1 / 60;
    void p;
    this.freezeAll();
  }

  /** Pieces that have frozen through take their shape as the one to hold; thawed ones let go. */
  private freezeAll(): void {
    const { order, fz, frz, x, y, rx, ry } = this;
    for (const p of this.pieces) {
      let f = 0;
      const old: number[] = [], fresh: number[] = [];
      for (let k = p.start; k < p.start + p.len; k++) { const i = order[k]; f += fz[i]; (frz[i] ? old : fresh).push(i); }
      f /= p.len;
      if (f > 0.5 && fresh.length) {
        // Freezing sets him in the shape he's in. Bits joining a frozen piece (or the last of
        // him to freeze) take their place in its frozen shape as they are now.
        if (old.length < 3) {
          for (const i of [...old, ...fresh]) { frz[i] = 1; rx[i] = x[i] - p.cx; ry[i] = y[i] - p.cy; }
        } else {
          const fr = this.frame(old);
          for (const i of fresh) {
            const ox = x[i] - fr.cx, oy = y[i] - fr.cy;
            frz[i] = 1; rx[i] = fr.co * ox + fr.si * oy + fr.rcx; ry[i] = -fr.si * ox + fr.co * oy + fr.rcy;
          }
        }
      } else if (f < 0.4 && old.length) for (const i of old) frz[i] = 0;
    }
  }

  /** Best-fit rotation of members' rest offsets onto where they are now. */
  private frame(members: Iterable<number>): { cx: number; cy: number; rcx: number; rcy: number; co: number; si: number } {
    const { x, y, rx, ry } = this;
    let n = 0, cx = 0, cy = 0, rcx = 0, rcy = 0;
    for (const i of members) { cx += x[i]; cy += y[i]; rcx += rx[i]; rcy += ry[i]; n++; }
    cx /= n; cy /= n; rcx /= n; rcy /= n;
    let a = 0, b = 0, c = 0, d = 0;
    for (const i of members) {
      const ox = x[i] - cx, oy = y[i] - cy, qx = rx[i] - rcx, qy = ry[i] - rcy;
      a += ox * qx; b += ox * qy; c += oy * qx; d += oy * qy;
    }
    const th = Math.atan2(c - b, a + d);
    return { cx, cy, rcx, rcy, co: Math.cos(th), si: Math.sin(th) };
  }

  /**
   * Oozing: his underside creeps along at the speed he wants to go, no faster (a fast conveyor
   * would run it out from under him as a tongue), and he leans his whole self that way, so he
   * flows along like a slug.
   */
  protected override crawl(p: Piece, dir: number, ooze: number, m: number, grounded: boolean): void {
    // Not oozing or pouring anywhere, he tenses up and holds the shape he's in (main piece only).
    this.tense = dir || (this.input.down ?? 0) > 0.05 ? 0 : Math.min(1, m);
    // Clinging to something tacky and pushing towards it, he hugs it: all of him leans in, so
    // he doesn't lever himself off it while his foot climbs.
    if (dir && this.clung > 1 && dir * p.vx < HUG_SPEED)
      for (let k = p.start; k < p.start + p.len; k++) this.vx[this.order[k]] += dir * HUG * Math.min(1, m) * (1 / 60);
    if (!dir || !ooze) return;
    const target = dir * this.tweaks.speed * 0.6 * Math.min(1, m);
    // His underside creeps along the surface towards the speed he wants (like a slug's foot),
    // only a little ahead of the rest of him, so it can't run out from under him...
    const foot = dir > 0 ? Math.min(target, Math.max(0, p.vx) + FOOT_LEAD) : Math.max(target, Math.min(0, p.vx) - FOOT_LEAD);
    for (let k = p.start; k < p.start + p.len; k++) this.tread[this.order[k]] = foot * ooze;
    // ...and the rest of him leans that way.
    const dv = target - p.vx;
    if (!grounded || dv * dir <= 0) return;
    const a = Math.min(Math.abs(dv), 260 * ooze * Math.min(1, m) * (1 / 60)) * dir;
    for (let k = p.start; k < p.start + p.len; k++) this.vx[this.order[k]] += a;
  }

  protected override rigidMain(): boolean {
    const p = this.pieces[0];
    return !!p && this.frz[this.order[p.start]] === 1;
  }

  protected override jumped(): void {
    this.unstick = 0.25;
  }

  // ---- Every substep ----

  protected solve(s: number): void {
    // (Neighbours found once a step, with a margin: nobody moves a pixel in a step's substeps... much.)
    if (s === 0) this.neighbours();
    this.springs(s === this.sub - 1);
    this.density();
    this.shape();
  }

  /** Pairs of particles within RH of each other (any piece). */
  private neighbours(): void {
    const { x, y, alive, head, next } = this, n = this.cap, w = this.ww;
    const cells: number[] = [];
    // (Cells clamped to the grid: this runs before collisions, so a particle may be just past
    // the world's edge for now, and it still has neighbours.)
    const hh = head.length / w;
    const cellX = (v: number) => Math.min(w - 1, Math.max(0, Math.floor(v))), cellY = (v: number) => Math.min(hh - 1, Math.max(0, Math.floor(v)));
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const cx = cellX(x[i]), cy = cellY(y[i]);
      const c = cy * w + cx;
      if (head[c] === -1) cells.push(c);
      next[i] = head[c];
      head[c] = i;
    }
    let np = 0;
    const { pa, pb } = this, max = pa.length;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const cx = cellX(x[i]), cy = cellY(y[i]);
      for (let oy = -RH - 1; oy <= RH + 1; oy++)
        for (let ox = -RH - 1; ox <= RH + 1; ox++) {
          const qx = cx + ox, qy = cy + oy;
          if (qx < 0 || qy < 0 || qx >= w) continue;
          const c = qy * w + qx;
          if (c >= head.length) continue;
          for (let j = head[c]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            if (dx * dx + dy * dy < (RH + 1) * (RH + 1) && np < max) { pa[np] = i; pb[np] = j; np++; }
          }
        }
    }
    this.np = np;
    for (const c of cells) head[c] = -1;
  }

  /**
   * Viscosity (XSPH, on the velocities after the substep's moves, as in position-based
   * fluids): neighbours in the same piece drag each other towards their shared motion. Thick
   * when runny, so he slumps and drips slowly and strings out instead of splashing.
   */
  protected override settle(): void {
    const { vx, vy, ca, cb, cq, piece, visc } = this;
    for (let k = 0; k < this.nc; k++) {
      const i = ca[k], j = cb[k];
      if (piece[i] !== piece[j]) continue;
      const mu = 0.25 * (visc[i] + visc[j]) * cq[k];
      const dx = (vx[j] - vx[i]) * mu, dy = (vy[j] - vy[i]) * mu;
      vx[i] += dx; vy[i] += dy; vx[j] -= dx; vy[j] -= dy;
    }
  }

  /** Springs pull towards their rest length, which itself gives way when held stretched or squeezed. */
  private springs(breaking: boolean): void {
    const tw = this.tweaks, { x, y, ba, bb, bl, ks, flow, creep, fz, rn, piece } = this, h = this.h;
    const tearAt = 0.35 + 1.5 * tw.cohesion;
    for (let k = this.nb - 1; k >= 0; k--) {
      const a = ba[k], b = bb[k];
      const dx = x[b] - x[a], dy = y[b] - y[a];
      const r = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      let L = bl[k];
      // Plastic flow: stretch (or squeeze) held beyond the yield becomes the new rest length.
      const al = 0.5 * (flow[a] + flow[b]) * h;
      if (r > L * (1 + YIELD)) L += al * (r - L * (1 + YIELD));
      else if (r < L * (1 - YIELD)) L -= al * (L * (1 - YIELD) - r);
      // And any stress at all fades slowly (a jelly can't sit locked in a strained shape).
      L += (r - L) * 0.5 * (creep[a] + creep[b]) * h;
      L = Math.max(0.8, L);
      bl[k] = L;
      if (breaking) {
        // A spring flowed long gives way (a thread thinning to nothing); a sudden yank tears
        // a firm one (frozen Bob cracks on impact instead, see impacts()).
        const f = 0.5 * (fz[a] + fz[b]), m = 0.5 * (rn[a] + rn[b]);
        if (L > LINK_MAX || (f < 0.5 && r / L - 1 > Math.max(TEAR_MIN, tearAt * (1 - THREAD * m * (piece[a] === 0 ? 1 - this.tense : 1))))) { this.breaks.strain++; this.unbond(k); this.cool[a] = this.cool[b] = Math.max(this.cool[a], 0.15); continue; }
      }
      const c = (0.5 * (ks[a] + ks[b]) * (r - L)) / r / 2;
      x[a] += dx * c; y[a] += dy * c;
      x[b] -= dx * c; y[b] -= dy * c;
    }
  }

  /**
   * Double density relaxation (Clavet et al. 2005): too crowded pushes apart, too sparse (at
   * his surface) pulls together, which is surface tension: it rounds drops off, draws a
   * thread into the drop at its end, and pinches it off. Between separate pieces only the push.
   */
  private density(): void {
    const { x, y, pa, pb, piece, rho, rhoN, alive, fsx, fsy, ca, cb, cq, cux, cuy } = this, n = this.cap;
    const coh = 0.4 + 0.8 * this.tweaks.cohesion;
    rho.fill(0, 0, n); rhoN.fill(0, 0, n);
    // Pairs actually within reach this substep, with their distance and direction (kept for
    // viscosity after the substep too).
    let nc = 0;
    for (let k = 0; k < this.np; k++) {
      const i = pa[k], j = pb[k];
      let dx = x[j] - x[i], dy = y[j] - y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 >= RH * RH) continue;
      const r = Math.sqrt(d2), q = 1 - r / RH;
      if (r < 1e-4) { dx = i & 1 ? 1 : -1; dy = 0; } else { dx /= r; dy /= r; }
      ca[nc] = i; cb[nc] = j; cq[nc] = q; cux[nc] = dx; cuy[nc] = dy; nc++;
      const q2 = q * q, q3 = q2 * q;
      rho[i] += q2; rho[j] += q2; rhoN[i] += q3; rhoN[j] += q3;
    }
    this.nc = nc;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      this.dens[i] = rho[i];
      const P = rho[i] - RHO0;
      // (Runny, his springs barely hold him: surface tension does, so it's stronger.)
      rho[i] = KP * (P < 0 ? P * coh * (1 + 1.5 * this.rn[i]) : P);
      rhoN[i] = KN * rhoN[i];
    }
    const join = this.tweaks.cohesion;
    for (let k = 0; k < nc; k++) {
      const i = ca[k], j = cb[k], q = cq[k], dx = cux[k], dy = cuy[k];
      let D = 0.5 * (rho[i] + rho[j]) * q + 0.5 * (rhoN[i] + rhoN[j]) * q * q;
      const r = (1 - q) * RH;
      if (r < RMIN) D = Math.max(D, (RMIN - r) * 0.5);
      const other = piece[i] !== piece[j];
      // Separate pieces draw together as readily as his cohesion says (then link up and join).
      if (other && D < 0) D *= join;
      D *= 0.5;
      x[i] -= dx * D; y[i] -= dy * D;
      x[j] += dx * D; y[j] += dy * D;
      // Pieces pressed together (or drawn together) move without gaining speed from it.
      if (other) { fsx[i] -= dx * D; fsy[i] -= dy * D; fsx[j] += dx * D; fsy[j] += dy * D; }
    }
  }

  /**
   * Shape: frozen particles are held to the shape they froze in; the rest are drawn towards a
   * round outline of their own area: a circle for the piece he's steering (squashed into an
   * ellipse in the world frame by sagging, winding up and pressing down), flatter for bits with
   * no will of their own. It's the outline that's steered, direction by direction from his
   * middle (each particle moves in or out in proportion, so neighbours stay neighbours): a
   * flat bottom or a lump is pulled round, so he rolls like a ball. Never where he is or how
   * he's turned: the corrections never move or spin him, so he rolls freely.
   */
  private shape(): void {
    const { x, y, order, round, stiff, frz, rx, ry, dsx, dsy, ext } = this;
    for (let pi = 0; pi < this.pieces.length; pi++) {
      const p = this.pieces[pi];
      if (p.len < 4) continue;
      let cx = 0, cy = 0;
      for (let k = p.start; k < p.start + p.len; k++) { const i = order[k]; cx += x[i]; cy += y[i]; }
      cx /= p.len; cy /= p.len;
      // How far his outline reaches in each direction.
      ext.fill(0);
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - cx, oy = y[i] - cy;
        const bin = Math.floor(((Math.atan2(oy, ox) / (Math.PI * 2)) * BINS + BINS + 0.5)) % BINS;
        ext[bin] = Math.max(ext[bin], Math.sqrt(ox * ox + oy * oy) + 0.5);
      }
      // (Directions with no particles, or a notch, borrow from their neighbours.)
      for (let pass = 0; pass < 2; pass++)
        for (let k = 0; k < BINS; k++) ext[k] = Math.max(ext[k], 0.5 * (ext[(k + BINS - 1) % BINS] + ext[(k + 1) % BINS]), 0.5);
      const [ea, eb] = this.aspect(pi, p), R = Math.sqrt(p.len / Math.PI) + 0.5;
      // Frozen particles: rest frame fitted to where they are now.
      let fr: ReturnType<Goo["frame"]> | null = null;
      const held: number[] = [];
      for (let k = p.start; k < p.start + p.len; k++) if (frz[order[k]]) held.push(order[k]);
      if (held.length >= 3) fr = this.frame(held);
      let mx = 0, my = 0;
      for (let k = p.start; k < p.start + p.len; k++) {
        const i = order[k], ox = x[i] - cx, oy = y[i] - cy;
        let gx = 0, gy = 0;
        const th = Math.atan2(oy, ox), u = ((th / (Math.PI * 2)) * BINS + BINS) % BINS;
        const k0 = Math.floor(u) % BINS, k1 = (k0 + 1) % BINS, f = u - Math.floor(u);
        const e = ext[k0] * (1 - f) + ext[k1] * f, d = Math.sqrt(ox * ox + oy * oy);
        // A surface well inside his outline is the edge of a hole in him: it closes up
        // (surface tension can't reach across a hole wider than its own reach).
        if (this.dens[i] < HOLE_RHO * RHO0 && d < e - 4 && d > 0.5 && !frz[i]) { gx -= (ox / d) * HOLE_PULL; gy -= (oy / d) * HOLE_PULL; }
        if (round[i] > 0) {
          const c = Math.cos(th) / ea, s = Math.sin(th) / eb, want = R / Math.sqrt(c * c + s * s);
          // (A step only ever moves the outline a little: a thin spot mustn't fling particles out.)
          const sc = (Math.min(RATIO, Math.max(1 / RATIO, want / e)) - 1) * round[i];
          let rx2 = ox * sc, ry2 = oy * sc;
          // Gently: an odd shape (a drop on a thread) would otherwise have its far ends dragged about.
          const gl = Math.sqrt(rx2 * rx2 + ry2 * ry2);
          if (gl > ROUND_MAX) { rx2 *= ROUND_MAX / gl; ry2 *= ROUND_MAX / gl; }
          gx += rx2; gy += ry2;
        }
        if (fr && frz[i]) {
          const qx = rx[i] - fr.rcx, qy = ry[i] - fr.rcy;
          gx += (fr.cx + fr.co * qx - fr.si * qy - x[i]) * stiff[i];
          gy += (fr.cy + fr.si * qx + fr.co * qy - y[i]) * stiff[i];
        }
        dsx[i] = gx; dsy[i] = gy;
        mx += gx; my += gy;
      }
      // Take out any net shift and spin: shape only.
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

  /** Wanted width and height factors (product 1) for a piece's spread. */
  private aspect(pi: number, p: Piece): [number, number] {
    if (pi === 0) return [this.sx, this.sy];
    // Bits with no will of their own slump, as far as cohesion lets them.
    const rn = Math.min(1, Math.max(0, (p.temp - 35) / 25));
    const a = Math.max(0.3, (0.5 + 0.45 * this.tweaks.cohesion) * (1 - 0.4 * rn));
    return [1 / a, a];
  }

  /**
   * Runny Bob is sticky, like honey: a particle next to a surface is drawn onto it and drags
   * along it. It only lets go when pulled more than a pixel off (weight hanging below, the
   * last of a thread), so he can ooze over a ledge and hang from it.
   */
  /**
   * Holding on. Runny, he's sticky like honey: a particle touching a floor or ceiling is held
   * against being pulled off (with a limited grip: a heavy enough load peels it away) and
   * drags along it; walls only drag (he hangs from the lip above). And at any temperature
   * short of frozen, tacky surfaces (moss, resin, gum) hold whatever touches them, walls
   * too: pressed on, his rolling grips and he pulls himself up. Nothing is drawn in from
   * further away than touching.
   */
  protected override stick(world: World, i: number, nx: number, ny: number): void {
    if (this.unstick > 0) { this.qx = nx; this.qy = ny; return; }
    const r = Math.max(0, (this.rn[i] - 0.5) / 0.5), live = 1 - this.fz[i], h2 = this.h * this.h;
    const x0 = nx, y0 = ny, cx = Math.floor(nx), cy = Math.floor(ny), fx = nx - cx, fy = ny - cy;
    const tack = (qx: number, qy: number) => (world.inside(qx, qy) ? TACK[world.mat[qy * world.w + qx]] * live : 0);
    // (Tacky surfaces hold on harder than runny honey: enough to hang his weight from a wall.)
    const pull = (d: number, k: number, t = 0) => { const g = (HOLD * k + TACK_HOLD * t) * h2; return Math.max(-g, Math.min(g, d * ADHESION * Math.max(k, t))); };
    // Pushing towards a tacky wall, the side of him touching it creeps up it (a gecko's foot).
    const climb = CLIMB * this.tweaks.speed * this.h * Math.min(1, this.tweaks.muscle * live);
    let held = 0;
    if (fy > 1 - TOUCH && this.solid(world, cx, cy + 1)) {
      const t = tack(cx, cy + 1), k = Math.max(r, t);
      if (k > 0) { ny += pull(cy + 1 - 0.02 - ny, r, t); held = Math.max(held, k); }
      const d = Math.max(FLOOR_DRAG * r, GRIP * t);
      // (His foot walks: on a tacky floor it creeps the way he's pushing, as on a wall.)
      const foot = t > 0 && this.piece[i] === 0 && this.input.move ? this.input.move * climb * Math.sqrt(t) : this.tread[i] * this.h;
      if (d > 0) nx = this.px[i] + foot + (nx - this.px[i] - foot) * (1 - d);
    }
    if (fy < TOUCH && this.solid(world, cx, cy - 1)) {
      const t = tack(cx, cy - 1), k = Math.max(r, t);
      if (k > 0) { ny += pull(cy + 0.02 - ny, r, t); held = Math.max(held, k); }
      const d = Math.max(0.3 * r, GRIP * tack(cx, cy - 1));
      if (d > 0) nx = this.px[i] + (nx - this.px[i]) * (1 - d);
    }
    for (const side of [1, -1]) {
      if (!(side > 0 ? fx > 1 - TOUCH : fx < TOUCH) || !this.solid(world, cx + side, cy)) continue;
      const k = tack(cx + side, cy);
      if (k > 0) { nx += pull((side > 0 ? cx + 1 - 0.02 : cx + 0.02) - nx, k, k); held = Math.max(held, k); }
      // (A tacky wall holds along itself too, and if he's pushing towards it, his foot on it
      // creeps upward: the rest of him is pulled up after it.)
      const d = Math.max(WALL_DRAG * r, GRIP * k);
      if (d > 0) ny = this.py[i] + (ny - this.py[i]) * (1 - d);
      if (k > 0 && this.piece[i] === 0 && this.input.move * side > 0) ny -= climb * Math.min(1, this.input.move * side) * Math.sqrt(k);
    }
    // Clinging to something tacky counts as footing for the piece he's steering.
    if (held > 0 && this.piece[i] === 0) this.cling += 1 / this.sub;
    // Holding on never pulls him into a solid (keep where collisions put him, on that axis).
    if (this.solid(world, Math.floor(nx), Math.floor(ny))) {
      if (!this.solid(world, Math.floor(nx), Math.floor(y0))) ny = y0;
      else if (!this.solid(world, Math.floor(x0), Math.floor(ny))) nx = x0;
      else { nx = x0; ny = y0; }
    }
    this.qx = nx; this.qy = ny;
  }

  protected override footing(p: Piece): boolean {
    const c = this.cling;
    this.clung = c;
    this.cling = 0;
    return p.ground + c >= Math.max(1, p.radius * 0.35);
  }

  // ---- After the substeps ----

  /**
   * Neighbours that come close link up: within a piece that's what lets runny Bob flow (old
   * links flow away, new ones form) and heal; between pieces it's bits joining, a few links
   * a step, each at the length it is now, so a bit joins without a jolt.
   */
  protected override merge(): void {
    const { x, y, pa, pb, piece, fz, cool, deg, ba, bb, adj, adjN } = this;
    adjN.fill(0);
    for (let k = 0; k < this.nb; k++) {
      const a = ba[k], b = bb[k];
      adj[a * NB + adjN[a]++] = b; adj[b * NB + adjN[b]++] = a;
    }
    const linked = (a: number, b: number) => {
      for (let d = 0; d < adjN[a]; d++) if (adj[a * NB + d] === b) return true;
      return false;
    };
    const join = this.tweaks.cohesion > 0.1;
    let joins = 0;
    for (let k = 0; k < this.np; k++) {
      const i = pa[k], j = pb[k];
      if (deg[i] >= NB - 2 || deg[j] >= NB - 2 || cool[i] > 0 || cool[j] > 0 || fz[i] >= 0.5 || fz[j] >= 0.5) continue;
      const r = Math.sqrt((x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2);
      const other = piece[i] !== piece[j];
      // (Separate pieces draw together until near-pressure holds them a little apart: they
      // link from there, or they'd sit glued side by side without ever joining.)
      if (r > (other ? JOIN_R : LINK_R) || linked(i, j)) continue;
      if (other && (!join || joins >= JOIN_MAX * (1 + 3 * Math.max(this.rn[i], this.rn[j])))) continue;
      this.bond(i, j, Math.max(0.8, r));
      adj[i * NB + adjN[i]++] = j; adj[j * NB + adjN[j]++] = i;
      if (other) { joins++; this.breaks.merge++; this.dirty = true; }
    }
  }
}
