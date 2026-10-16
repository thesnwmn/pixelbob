import { AMBIENT, CAT, CONDUCT, Cat, DENSITY, DISSOLVE, FLAMMABLE, FLOW, IGNITE, M, MATS, MOBILITY } from "./materials.ts";

/** Chunk size in cells (power of two). Chunks with nothing happening sleep. */
export const CHUNK = 32;
const CS = 5; // log2(CHUNK)

const EMPTY = Cat.Empty, STATIC = Cat.Static, POWDER = Cat.Powder, LIQUID = Cat.Liquid, GAS = Cat.Gas, FIRE = Cat.Fire;

/**
 * The world grid: one cell per pixel, stored as parallel typed arrays.
 * `step()` advances one fixed 1/60 s tick. Deterministic for a given seed and
 * sequence of edits: never reads the clock or Math.random().
 */
export class World {
  readonly w: number;
  readonly h: number;
  /** Material id per cell. */
  readonly mat: Uint8Array;
  /** Random per-cell colour variant, fixed when the cell is created. */
  readonly shade: Uint8Array;
  /** Temperature in °C. */
  readonly temp: Float32Array;
  /** Countdown: fire and gas lifetime, or burn time left for burning solids. */
  readonly life: Uint16Array;
  /** Extra state: plant growth energy. */
  readonly aux: Uint8Array;
  /** Ambient temperature per cell: air relaxes towards it (cold caves, hot vents). */
  readonly base: Float32Array;
  /** What's behind the cell: 0 = sky, 1 = rock wall (where you've dug). */
  readonly back: Uint8Array;
  /** Chunks to update this step / next step. */
  readonly awake: Uint8Array;
  private next: Uint8Array;
  private readonly stamp: Uint16Array;
  /** Per liquid cell: index of the highest open surface cell of its connected body (or -1). */
  private readonly src: Int32Array;
  /** Chunks that held liquid at the last pressure pass. */
  private readonly wet: Uint8Array;
  readonly cw: number;
  readonly ch: number;
  tick = 0;
  private seed: number;

  constructor(w: number, h: number, seed = 1) {
    this.w = w; this.h = h;
    const n = w * h;
    this.mat = new Uint8Array(n);
    this.shade = new Uint8Array(n);
    this.temp = new Float32Array(n).fill(AMBIENT);
    this.life = new Uint16Array(n);
    this.aux = new Uint8Array(n);
    this.back = new Uint8Array(n);
    this.base = new Float32Array(n).fill(AMBIENT);
    this.stamp = new Uint16Array(n);
    this.src = new Int32Array(n).fill(-1);
    this.cw = (w + CHUNK - 1) >> CS;
    this.ch = (h + CHUNK - 1) >> CS;
    this.awake = new Uint8Array(this.cw * this.ch).fill(1);
    this.wet = new Uint8Array(this.cw * this.ch).fill(1);
    this.next = new Uint8Array(this.cw * this.ch).fill(1);
    this.seed = seed >>> 0 || 1;
    for (let i = 0; i < n; i++) this.shade[i] = this.rand() * 256;
  }

  /** xorshift32 in [0, 1). */
  rand(): number {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.mat[y * this.w + x] : M.rock;
  }

  /** Wake the chunks around a cell so they update next step. */
  wake(x: number, y: number): void {
    const x0 = Math.max(0, (x - 1) >> CS), x1 = Math.min(this.cw - 1, (x + 1) >> CS);
    const y0 = Math.max(0, (y - 1) >> CS), y1 = Math.min(this.ch - 1, (y + 1) >> CS);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.next[cy * this.cw + cx] = 1;
  }

  /** Create a fresh cell of material m (resets its state; temperature from the material). */
  set(x: number, y: number, m: number): void {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.put(i, m);
    this.wake(x, y);
  }

  private put(i: number, m: number): void {
    const d = MATS[m];
    this.mat[i] = m;
    this.shade[i] = this.rand() * 256;
    if (m !== M.air && d.spawnTemp !== AMBIENT) this.temp[i] = d.spawnTemp;
    else if (m !== M.air) this.temp[i] = this.base[i];
    this.life[i] = m === M.spore ? 600 + this.rand() * 900 : m === M.fire ? 20 + this.rand() * 30 : m === M.steam ? 240 + this.rand() * 240 : m === M.smoke ? 90 + this.rand() * 120 : 0;
    this.aux[i] = m === M.plant ? 3 : m === M.vine ? 14 : 0;
  }

  /** Change a cell in place during a step (keeps temperature unless the material has its own). */
  private convert(i: number, m: number, keepTemp = false): void {
    const t = this.temp[i];
    this.put(i, m);
    if (keepTemp) this.temp[i] = t;
    this.stamp[i] = this.tick;
    this.wake(i % this.w, (i / this.w) | 0);
  }

  /** Put a burning solid out and cool it, so it doesn't relight from its own heat. */
  private douse(i: number): void {
    this.life[i] = 0;
    this.temp[i] = Math.min(this.temp[i], 60);
    this.wake(i % this.w, (i / this.w) | 0);
  }

  /** Does cell i touch air, gas, fire or loose ash? Solids need that to burn. */
  private breathes(i: number): boolean {
    const { w, mat } = this;
    const x = i % w;
    for (const j of [i - w, i + w, i - 1, i + 1]) {
      if (j < 0 || j >= mat.length || Math.abs((j % w) - x) > 1) continue;
      const c = CAT[mat[j]];
      // Loose ash lets air through.
      if (c === EMPTY || c === GAS || c === FIRE || mat[j] === M.ash) return true;
    }
    return false;
  }

  private ignite(i: number): void {
    const m = this.mat[i];
    if (m === M.gunpowder) {
      // Lit gunpowder fizzes for a few steps, then goes off.
      if (this.life[i] === 0) this.life[i] = 1 + this.rand() * 4;
      this.wake(i % this.w, (i / this.w) | 0);
      return;
    }
    if (m === M.methane && this.rand() < 0.03) {
      this.convert(i, M.air, true);
      this.explode(i % this.w, (i / this.w) | 0, 2.5);
      return;
    }
    if (CAT[m] === STATIC) {
      // Solids burn in place, throwing flames until their fuel runs out,
      // but only with air to burn in: underwater or buried wood won't catch.
      if (!this.breathes(i)) return;
      if (this.life[i] === 0) this.life[i] = MATS[m].burnTime * (0.6 + this.rand() * 0.8);
    } else {
      this.convert(i, M.fire);
      this.life[i] = MATS[m].burnTime * (0.5 + this.rand());
    }
    this.wake(i % this.w, (i / this.w) | 0);
  }

  private swap(i: number, j: number): void {
    const { mat, shade, temp, life, aux, stamp } = this;
    let t = mat[i]; mat[i] = mat[j]; mat[j] = t;
    t = shade[i]; shade[i] = shade[j]; shade[j] = t;
    const tt = temp[i]; temp[i] = temp[j]; temp[j] = tt;
    t = life[i]; life[i] = life[j]; life[j] = t;
    t = aux[i]; aux[i] = aux[j]; aux[j] = t;
    stamp[i] = stamp[j] = this.tick;
    const w = this.w;
    this.wake(i % w, (i / w) | 0);
    this.wake(j % w, (j / w) | 0);
  }

  /** Can material m (moving in its gravity direction g) push into cell (x, y)? */
  private canEnter(m: number, x: number, y: number, g: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const t = this.mat[y * this.w + x];
    const c = CAT[t];
    if (c === STATIC) return false;
    if (g > 0) {
      if (DENSITY[t] >= DENSITY[m]) return false;
      // Drag: pushing through a liquid or powder only succeeds some of the time.
      // Sinking through water is slowed; a buried light powder (pushed up by the
      // liquid above it) drifts up very slowly instead of popping straight out.
      if (c === LIQUID) return this.rand() < (CAT[m] === LIQUID ? 0.3 : 0.5);
      if (c === POWDER) return CAT[m] === POWDER || this.rand() < 0.04;
      return true;
    }
    // Rising gases bubble through air, other gases and liquids, never powders.
    if (c === POWDER || DENSITY[t] <= DENSITY[m]) return false;
    return c !== LIQUID || this.rand() < 0.5;
  }

  /** Advance one step. */
  step(): void {
    this.tick = (this.tick + 1) & 0xffff || 1;
    // Swap the chunk sets: what was woken last step is awake now.
    this.awake.set(this.next);
    this.next.fill(0);
    const { w, h, mat, awake, stamp, cw } = this;
    const T = this.tick;
    for (let y = h - 1; y >= 0; y--) {
      const rowChunk = (y >> CS) * cw;
      const ltr = ((y + T) & 1) === 0;
      for (let k = 0; k < w; k++) {
        const x = ltr ? k : w - 1 - k;
        if (!awake[rowChunk + (x >> CS)]) {
          // Skip to the edge of this sleeping chunk.
          const edge = ltr ? ((x >> CS) + 1) << CS : (x >> CS) << CS;
          k += ltr ? edge - x - 1 : x - edge;
          continue;
        }
        const i = y * w + x;
        if (stamp[i] === T) continue;
        const m = mat[i];
        switch (CAT[m]) {
          case EMPTY: break;
          case POWDER: this.powder(i, x, y, m); break;
          case LIQUID: this.liquid(i, x, y, m); break;
          case GAS: this.gas(i, x, y, m); break;
          case FIRE: this.fire(i, x, y); break;
          default: this.solid(i, x, y, m);
        }
      }
    }
    this.pressure();
    this.thermal();
  }

  private powder(i: number, x: number, y: number, m: number): void {
    if (m === M.spore && this.spore(i, x, y)) return;
    if (m === M.gunpowder && this.life[i] > 0) {
      this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
      if (--this.life[i] === 0) { this.convert(i, M.air, true); this.explode(x, y, 5); return; }
    }
    if (m === M.salt && this.saltContact(i, x)) return;
    if (this.rand() > MOBILITY[m]) { this.next[(y >> CS) * this.cw + (x >> CS)] = 1; return; }
    const g = 1, w = this.w;
    if (this.canEnter(m, x, y + g, g)) return this.swap(i, i + w);
    const d = this.rand() < 0.5 ? -1 : 1;
    if (this.canEnter(m, x + d, y + g, g)) return this.swap(i, i + w + d);
    if (this.canEnter(m, x - d, y + g, g)) return this.swap(i, i + w - d);
  }

  private liquid(i: number, x: number, y: number, m: number): void {
    if (m === M.lava) this.lavaContact(i, x, y);
    else if (m === M.acid && this.acidContact(i, x, y)) return;
    else if (m === M.water && this.soak(i, x)) return;
    else if (m === M.mud) this.bubble(i, x, y);
    if (this.mat[i] !== m) return;
    if (this.rand() > MOBILITY[m]) { this.next[(y >> CS) * this.cw + (x >> CS)] = 1; return; }
    const g = 1, w = this.w;
    if (this.canEnter(m, x, y + g, g)) return this.swap(i, i + w);
    const d = this.rand() < 0.5 ? -1 : 1;
    if (this.canEnter(m, x + d, y + g, g)) return this.swap(i, i + w + d);
    if (this.canEnter(m, x - d, y + g, g)) return this.swap(i, i + w - d);
    // Flow sideways as far as it can, stopping early over a hole.
    for (const dir of [d, -d]) {
      let best = 0;
      for (let s = 1; s <= FLOW[m]; s++) {
        if (!this.canEnter(m, x + dir * s, y, g)) break;
        best = s;
        if (this.canEnter(m, x + dir * s, y + g, g)) break;
      }
      if (best) return this.swap(i, i + dir * best);
    }
  }

  private gas(i: number, x: number, y: number, m: number): void {
    const { w, life } = this;
    if (m !== M.toxic) {
      if (life[i] <= 1) {
        // Steam condenses back to water; smoke just thins out.
        this.convert(i, m === M.steam && this.rand() < 0.3 ? M.water : M.air, true);
        return;
      }
      life[i]--;
    }
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() > MOBILITY[m]) return;
    const g = DENSITY[m] > 1 ? 1 : -1;
    const r = this.rand();
    const dx = r < 0.33 ? -1 : r < 0.66 ? 1 : 0;
    if (this.rand() < 0.7) {
      if (this.canEnter(m, x + dx, y + g, g)) return this.swap(i, i + g * w + dx);
      if (this.canEnter(m, x, y + g, g)) return this.swap(i, i + g * w);
    }
    const s = dx || (this.rand() < 0.5 ? -1 : 1);
    // Sideways drift: only into air or other gases.
    const nx = x + s;
    if (nx >= 0 && nx < w) {
      const t = this.mat[i + s];
      if ((CAT[t] === EMPTY || CAT[t] === GAS) && t !== m) this.swap(i, i + s);
    }
  }

  private fire(i: number, x: number, y: number): void {
    const { w, life, mat } = this;
    this.temp[i] = Math.max(this.temp[i], 650);
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    // Spread to neighbours; water puts it out.
    let fuel = false;
    for (let n = 0; n < 4; n++) {
      const nx = x + (n === 0 ? -1 : n === 1 ? 1 : 0), ny = y + (n === 2 ? -1 : n === 3 ? 1 : 0);
      if (!this.inside(nx, ny)) continue;
      const j = ny * w + nx, t = mat[j];
      if (t === M.water) {
        this.convert(i, M.smoke);
        if (this.rand() < 0.4) this.convert(j, M.steam);
        return;
      }
      if (FLAMMABLE[t] > 0) {
        fuel = true;
        if (this.rand() < FLAMMABLE[t]) this.ignite(j);
      }
      if (life[j] > 0 && CAT[t] === STATIC) fuel = true;
    }
    const decay = fuel ? 1 : 2;
    if (life[i] <= decay) {
      const r = this.rand();
      this.convert(i, r < 0.4 ? M.smoke : M.air, true);
      return;
    }
    life[i] -= decay;
    // Flames lick upward and flicker sideways.
    if (this.rand() < 0.6) {
      const dx = ((this.rand() * 3) | 0) - 1;
      if (this.inside(x + dx, y - 1) && mat[i - w + dx] === M.air) return this.swap(i, i - w + dx);
    }
  }

  private solid(i: number, x: number, y: number, m: number): void {
    const { w, life, mat } = this;
    if (life[i] > 0) {
      // Burning: throw flames into open neighbours, heat up, and use up fuel.
      this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
      this.temp[i] = Math.max(this.temp[i], 450);
      const r = this.rand();
      const j = r < 0.5 ? i - w : r < 0.7 ? i - 1 : r < 0.9 ? i + 1 : i + w;
      if (j >= 0 && j < mat.length && mat[j] === M.air && this.rand() < 0.35) {
        this.convert(j, M.fire);
        life[j] = 6 + this.rand() * 14;
      }
      for (const j2 of [i - w, i + w, i - 1, i + 1]) {
        if (j2 < 0 || j2 >= mat.length) continue;
        if (mat[j2] === M.water) { this.douse(i); this.convert(j2, M.steam); return; }
        if (FLAMMABLE[mat[j2]] > 0 && this.rand() < FLAMMABLE[mat[j2]] * 0.3) this.ignite(j2);
      }
      // Smothered: nothing to breathe, so it goes out.
      if (!this.breathes(i)) { this.douse(i); return; }
      if (--life[i] === 0) this.convert(i, this.rand() < 0.3 ? M.ash : M.air, true);
      return;
    }
    if (m === M.plant) this.grow(i, x, y);
    else if (m === M.stem) this.growStem(i, x, y);
    else if (m === M.cap) this.shedSpores(i, x, y);
    else if (m === M.vine) this.growVine(i, x, y);
    else if (m === M.steel) this.corrode(i, x, y);
    else if (m === M.rust) this.crumble(i, x, y);
  }

  /** A random 4-neighbour index of i (or -1 off the edge). */
  private neighbour(i: number, x: number): number {
    const r = (this.rand() * 4) | 0, w = this.w;
    const j = r === 0 ? i - w : r === 1 ? i + w : r === 2 ? i - 1 : i + 1;
    if (j < 0 || j >= this.mat.length || Math.abs((j % w) - x) > 1) return -1;
    return j;
  }

  /** Water slowly soaks into dirt, turning it to mud. Returns true if the water is used up. */
  private soak(i: number, x: number): boolean {
    // Water resting on dirt keeps its chunk awake so the soaking carries on.
    if (i + this.w < this.mat.length && this.mat[i + this.w] === M.dirt) this.next[((i / this.w) >> CS) * this.cw + ((i % this.w) >> CS)] = 1;
    const j = this.neighbour(i, x);
    if (j < 0 || this.mat[j] !== M.dirt || this.rand() > 0.004) return false;
    this.convert(j, M.mud, true);
    this.convert(i, M.air, true);
    return true;
  }

  /** Mud lets the odd bubble of methane out of its surface. */
  private bubble(i: number, x: number, y: number): void {
    const j = i - this.w;
    if (j < 0 || this.mat[j] !== M.air) return;
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() < 0.0003) this.set(x, y - 1, M.methane);
  }

  /** Salt dissolves into water (making brine) and melts ice and snow. Returns true if the salt is gone. */
  private saltContact(i: number, x: number): boolean {
    const j = this.neighbour(i, x);
    if (j < 0) return false;
    const t = this.mat[j];
    if (t === M.water && this.rand() < 0.05) {
      this.convert(j, M.brine, true);
      this.convert(i, M.air, true);
      return true;
    }
    if ((t === M.ice || t === M.snow) && this.rand() < 0.02) {
      this.convert(j, M.brine, true);
      if (this.rand() < 0.3) { this.convert(i, M.air, true); return true; }
    }
    return false;
  }

  /** Vines hang: they grow down (or along a ceiling) and drink water like plants. */
  private growVine(i: number, x: number, y: number): void {
    const { w, mat, aux } = this;
    const j0 = this.neighbour(i, x);
    if (j0 >= 0 && mat[j0] === M.water && this.rand() < 0.08) { this.convert(j0, M.air, true); aux[i] = Math.min(40, aux[i] + 6); }
    if (aux[i] === 0) return;
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() > 0.05) return;
    const r = this.rand();
    const dx = r < 0.15 ? -1 : r < 0.3 ? 1 : 0;
    let j = -1;
    if (this.get(x + dx, y + 1) === M.air) j = (y + 1) * w + x + dx;
    else {
      // Blocked below: creep sideways while there's something to cling to above.
      const s = this.rand() < 0.5 ? -1 : 1;
      if (this.get(x + s, y) === M.air && CAT[this.get(x + s, y - 1)] === STATIC) j = i + s;
    }
    if (j < 0) { aux[i] = 0; return; }
    this.convert(j, M.vine, true);
    aux[j] = aux[i] - 1;
    aux[i] = 0;
  }

  /** Wet steel rusts; brine rusts it faster. */
  private corrode(i: number, x: number, y: number): void {
    const j = this.neighbour(i, x);
    if (j < 0) return;
    const t = this.mat[j];
    if (t !== M.water && t !== M.brine && t !== M.steam) return;
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() < (t === M.brine ? 0.012 : 0.004)) this.convert(i, M.rust, true);
  }

  /** Rust with nothing solid under it flakes away. */
  private crumble(i: number, x: number, y: number): void {
    const below = y + 1 < this.h ? this.mat[i + this.w] : M.rock;
    if (CAT[below] === STATIC) return;
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() < 0.004) this.convert(i, M.flakes, true);
  }

  /**
   * A blast: carves a crater, throws loose material outward as rubble,
   * heats and sets fire to things, and lights any gunpowder caught in it.
   */
  explode(cx: number, cy: number, r: number): void {
    const { w, mat, temp } = this;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!this.inside(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const i = y * w + x, m = mat[i], c = CAT[m];
        temp[i] = Math.min(2000, temp[i] + 600 * (1 - d));
        this.wake(x, y);
        if (m === M.gunpowder) { if (this.life[i] === 0) this.life[i] = 1 + this.rand() * 6; continue; }
        if (m === M.steel || m === M.air) {
          if (m === M.air && d < 0.7 && this.rand() < 0.35) { this.convert(i, M.fire, true); this.life[i] = 4 + this.rand() * 10; }
          continue;
        }
        const hard = m === M.rock || m === M.stone || m === M.rust ? 0.45 : 1;
        if (this.rand() > (1 - d * 0.6) * hard) continue;
        if (FLAMMABLE[m] > 0 && c !== STATIC) { this.convert(i, M.fire, true); continue; }
        if (d < 0.45) { this.convert(i, this.rand() < 0.25 ? M.smoke : M.air, true); continue; }
        // Outer ring: throw the cell outward; solids break into rubble.
        const thrown = c === STATIC ? (m === M.wood || m === M.plant || m === M.vine ? M.ash : m === M.ice ? M.snow : M.rubble) : m;
        const ux = (x - cx) / (d * r || 1), uy = (y - cy) / (d * r || 1) - 0.6;
        const n = Math.hypot(ux, uy) || 1;
        this.convert(i, M.air, true);
        for (let k = Math.ceil(r * 1.5); k >= 1; k--) {
          const tx = Math.round(x + (ux / n) * k), ty = Math.round(y + (uy / n) * k);
          if (this.inside(tx, ty) && mat[ty * w + tx] === M.air) { this.set(tx, ty, thrown); break; }
        }
      }
  }

  /**
   * A spore resting on dirt, wood or plants underground (behind rock wall)
   * may sprout a stem; damp spots (water close by) sprout far more readily.
   * Spores that never find a home dry up. Returns true if the spore is gone.
   */
  private spore(i: number, x: number, y: number): boolean {
    const { w, mat, life } = this;
    if (--life[i] === 0) { this.convert(i, M.air, true); return true; }
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    const below = y + 1 < this.h ? mat[i + w] : M.rock;
    if (below !== M.dirt && below !== M.wood && below !== M.plant && below !== M.ash) return false;
    if (!this.back[i] || this.rand() > 0.02) return false;
    let damp = false;
    for (let dy = -3; dy <= 4 && !damp; dy++)
      for (let dx = -4; dx <= 4; dx++) if (this.get(x + dx, y + dy) === M.water) { damp = true; break; }
    if (!damp && this.rand() > 0.15) return false;
    this.convert(i, M.stem, true);
    this.aux[i] = 4 + ((this.rand() * 12) | 0);
    return true;
  }

  /** Stems push up a cell at a time; when the energy runs out the tip opens into a cap. */
  private growStem(i: number, x: number, y: number): void {
    const { w, mat, aux } = this;
    if (aux[i] === 0) return;
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() > 0.08) return;
    if (aux[i] === 1 || y === 0 || mat[i - w] !== M.air) {
      // Open a domed cap around the tip.
      const r = 2 + ((this.rand() * 3) | 0);
      for (let dy = -r; dy <= 0; dy++)
        for (let dx = -r - 1; dx <= r + 1; dx++) {
          if ((dx * dx) / ((r + 1) * (r + 1)) + (dy * dy) / (r * r * 0.6) > 1) continue;
          const cx = x + dx, cy = y - 1 + dy;
          if (this.inside(cx, cy) && mat[cy * w + cx] === M.air) this.set(cx, cy, M.cap);
        }
      aux[i] = 0;
      return;
    }
    const dx = this.rand() < 0.15 ? (this.rand() < 0.5 ? -1 : 1) : 0;
    const j = i - w + dx;
    if (mat[j] !== M.air) { aux[i] = 1; return; }
    this.convert(j, M.stem, true);
    aux[j] = aux[i] - 1;
    aux[i] = 0;
  }

  /** Mature caps now and then drop a spore from their underside. */
  private shedSpores(i: number, x: number, y: number): void {
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() > 0.0002) return;
    const j = i + this.w;
    if (j < this.mat.length && this.mat[j] === M.air) this.set(x, y + 1, M.spore);
  }

  /** Plants drink adjacent water and push growth energy up to a new tip. */
  private grow(i: number, x: number, y: number): void {
    const { w, mat, aux } = this;
    for (const j of [i + w, i - 1, i + 1, i - w]) {
      if (j >= 0 && j < mat.length && mat[j] === M.water && this.rand() < 0.08) {
        this.convert(j, M.air, true);
        aux[i] = Math.min(60, aux[i] + 8);
      }
    }
    if (aux[i] === 0) return;
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
    if (this.rand() > 0.06) return;
    const dx = ((this.rand() * 3) | 0) - 1;
    const tx = x + dx, ty = y - 1;
    if (!this.inside(tx, ty)) return;
    const j = ty * w + tx;
    if (mat[j] !== M.air) {
      if (CAT[mat[j]] !== STATIC || mat[j] === M.plant) aux[i] = Math.max(0, aux[i] - 1);
      return;
    }
    this.convert(j, M.plant, true);
    aux[j] = aux[i] - 1;
    aux[i] = 0;
  }

  private lavaContact(i: number, x: number, y: number): void {
    const { w, mat } = this;
    for (const j of [i - w, i + w, i - 1, i + 1]) {
      if (j < 0 || j >= mat.length || Math.abs((j % w) - x) > 1) continue;
      const t = mat[j];
      if (t === M.water) {
        this.convert(j, M.steam);
        this.temp[i] -= 260;
      } else if (t === M.ice || t === M.snow) {
        this.convert(j, M.water);
        this.temp[i] -= 120;
      } else if (FLAMMABLE[t] > 0 && this.rand() < 0.2) this.ignite(j);
    }
    this.next[(y >> CS) * this.cw + (x >> CS)] = 1;
  }

  /** Acid eats a neighbour now and then, and is used up doing it. Returns true if the acid is gone. */
  private acidContact(i: number, x: number, y: number): boolean {
    const { w, mat } = this;
    const r = (this.rand() * 4) | 0;
    const j = r === 0 ? i - w : r === 1 ? i + w : r === 2 ? i - 1 : i + 1;
    if (j < 0 || j >= mat.length || Math.abs((j % w) - x) > 1) return false;
    const d = DISSOLVE[mat[j]];
    if (d > 0 && mat[j] !== M.acid && this.rand() < d * 0.4) {
      this.convert(j, this.rand() < 0.15 ? M.toxic : M.air, true);
      if (this.rand() < 0.3) { this.convert(i, M.air, true); return true; }
    }
    return false;
  }

  /** Is i a liquid surface cell (open air or gas directly above)? */
  private surface(i: number): boolean {
    if (i < this.w) return true;
    const c = CAT[this.mat[i - this.w]];
    return c === EMPTY || c === GAS;
  }

  /**
   * A remembered surface cell may have flowed sideways or dropped a row since
   * it was recorded: look around it for the nearest valid surface of liquid m.
   */
  private fix(s: number, m: number): number {
    if (s < 0) return -1;
    const { w, mat } = this;
    const x = s % w;
    for (const d of [0, -1, 1, -2, 2, w, w - 1, w + 1]) {
      const t = s + d;
      if (t < 0 || t >= mat.length || Math.abs((t % w) - x) > 2) continue;
      if (mat[t] === m && this.surface(t)) return t;
    }
    return -1;
  }

  /**
   * Hydrostatic pressure, done as levelling: every liquid cell learns the
   * highest open surface of its connected body (src), passed top-down and
   * sideways each step. A surface at least two cells lower than that pulls a
   * cell across, so connected vessels (U-bends, flooded caves) even out.
   * Cells with open space at their sides (falling streams) don't pass it on,
   * so a waterfall can't pump the pool below up to its source. Runs over the
   * whole grid, as bodies span sleeping chunks; only liquid cells do work.
   */
  private pressure(): void {
    const { w, h, mat, src, wet, awake, next, cw } = this;
    const ltr = (this.tick & 1) === 0;
    // Visit chunks that held liquid, or that changed (liquid can only arrive by a change).
    const visit = new Uint8Array(wet.length);
    for (let c = 0; c < wet.length; c++) { visit[c] = wet[c] | awake[c] | next[c]; if (visit[c]) wet[c] = 0; }
    for (let y = 0; y < h; y++) {
      const row = y * w, crow = (y >> CS) * cw;
      for (let k = 0; k < cw; k++) {
        const cx = ltr ? k : cw - 1 - k;
        if (!visit[crow + cx]) continue;
        const x0 = cx << CS, x1 = Math.min(w, x0 + CHUNK);
        for (let q = 0; q < x1 - x0; q++) {
          const x = ltr ? x0 + q : x1 - 1 - q, i = row + x, m = mat[i];
          if (CAT[m] !== LIQUID) { src[i] = -1; continue; }
          wet[crow + cx] = 1;
          // Best (highest) still-valid surface among same-liquid neighbours.
          let best = -1, by = 1e9;
          for (let n = 0; n < 4; n++) {
            const j = n === 0 ? i - w : n === 1 ? i + w : n === 2 ? i - 1 : i + 1;
            if (j < 0 || j >= mat.length || (n > 1 && Math.abs((j % w) - x) > 1) || mat[j] !== m) continue;
            const s = this.fix(src[j], m);
            if (s < 0) continue;
            const sy = (s / w) | 0;
            if (sy < by) { by = sy; best = s; }
          }
          if (this.surface(i)) {
            src[i] = best >= 0 && by < y ? best : i;
            // Level out: a higher connected surface pushes a cell up here.
            if (best >= 0 && by < y - 1 && y > 0 && mat[i - w] === M.air && this.rand() < 0.35) this.swap(best, i - w);
            continue;
          }
          const l = x > 0 ? CAT[mat[i - 1]] : STATIC, r = x < w - 1 ? CAT[mat[i + 1]] : STATIC;
          src[i] = l === EMPTY || r === EMPTY ? -1 : best;
        }
      }
    }
  }

  /** Heat flow between neighbours and the phase changes it causes, in awake chunks. */
  private thermal(): void {
    const { w, h, mat, temp, awake, cw, life, base } = this;
    for (let cy = 0; cy < this.ch; cy++)
      for (let cx = 0; cx < cw; cx++) {
        if (!awake[cy * cw + cx]) continue;
        let busy = false;
        const y1 = Math.min(h, (cy + 1) << CS), x1 = Math.min(w, (cx + 1) << CS);
        for (let y = cy << CS; y < y1; y++)
          for (let x = cx << CS; x < x1; x++) {
            const i = y * w + x, m = mat[i];
            const tl = x > 0 ? temp[i - 1] : temp[i], tr = x < w - 1 ? temp[i + 1] : temp[i];
            const tu = y > 0 ? temp[i - w] : temp[i], td = y < h - 1 ? temp[i + w] : temp[i];
            let t = temp[i];
            t += CONDUCT[m] * ((tl + tr + tu + td) * 0.25 - t);
            const b = base[i];
            if (m === M.air) t += (b - t) * 0.02;
            temp[i] = t;
            if (t > b + 3 || t < b - 3) busy = true;
            // Phase changes.
            if (m === M.water) {
              if (t > 100) { this.convert(i, M.steam, true); continue; }
              if (t < 0 && this.rand() < 0.02) { this.convert(i, M.ice, true); continue; }
            } else if (m === M.brine) {
              if (t > 100) { this.convert(i, this.rand() < 0.5 ? M.salt : M.steam, true); continue; }
              if (t < -15 && this.rand() < 0.02) { this.convert(i, M.ice, true); continue; }
            } else if (m === M.mud) {
              if (t > 60 && this.rand() < 0.02) { this.convert(i, M.dirt, true); continue; }
            } else if ((m === M.ice && t > 2) || (m === M.snow && t > 1)) {
              if (this.rand() < 0.01) { this.convert(i, M.water, true); continue; }
            } else if (m === M.lava) {
              if (t < 650 && this.rand() < 0.05) { this.convert(i, M.stone, true); continue; }
            } else if (m === M.rock || m === M.stone || m === M.dirt) {
              if (t > 1100 && this.rand() < 0.02) { this.convert(i, M.lava, true); continue; }
            } else if (m === M.sand) {
              if (t > 900 && this.rand() < 0.02) { this.convert(i, M.glass, true); continue; }
            }
            if (t > IGNITE[m] && life[i] === 0 && FLAMMABLE[m] > 0) this.ignite(i);
          }
        if (busy) this.next[cy * cw + cx] = 1;
      }
  }

  // ---- Editing (brushes) ----

  /**
   * Paint a disc of material. Placing only fills open cells (air, gas, fire);
   * `replace` overwrites anything. Painting air digs and leaves rock wall behind.
   */
  paint(cx: number, cy: number, r: number, m: number, opts: { fill?: number; replace?: boolean } = {}): void {
    const fill = opts.fill ?? 1, replace = opts.replace ?? m === M.air;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!this.inside(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        if (fill < 1 && this.rand() > fill) continue;
        const cur = this.mat[y * this.w + x];
        if (!replace && CAT[cur] !== EMPTY && CAT[cur] !== GAS && CAT[cur] !== FIRE) continue;
        if (cur === m) continue;
        this.set(x, y, m);
      }
  }

  /** Add (or remove) heat in a disc, strongest in the middle. */
  heat(cx: number, cy: number, r: number, dt: number): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!this.inside(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const i = y * this.w + x;
        this.temp[i] = Math.max(-80, Math.min(2500, this.temp[i] + dt * (1 - d * d)));
        this.wake(x, y);
      }
  }

  /** Wake every chunk (after editing arrays directly). */
  wakeAll(): void {
    this.next.fill(1);
  }

  /** Number of awake chunks (for the debug HUD). */
  awakeCount(): number {
    let n = 0;
    for (const a of this.awake) n += a;
    return n;
  }

  count(m: number): number {
    let n = 0;
    for (const v of this.mat) if (v === m) n++;
    return n;
  }
}
