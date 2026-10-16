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
    this.cw = (w + CHUNK - 1) >> CS;
    this.ch = (h + CHUNK - 1) >> CS;
    this.awake = new Uint8Array(this.cw * this.ch).fill(1);
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
    this.life[i] = m === M.fire ? 20 + this.rand() * 30 : m === M.steam ? 240 + this.rand() * 240 : m === M.smoke ? 90 + this.rand() * 120 : 0;
    this.aux[i] = m === M.plant ? 3 : 0;
  }

  /** Change a cell in place during a step (keeps temperature unless the material has its own). */
  private convert(i: number, m: number, keepTemp = false): void {
    const t = this.temp[i];
    this.put(i, m);
    if (keepTemp) this.temp[i] = t;
    this.stamp[i] = this.tick;
    this.wake(i % this.w, (i / this.w) | 0);
  }

  private ignite(i: number): void {
    const m = this.mat[i];
    if (CAT[m] === STATIC) {
      // Solids burn in place, throwing flames until their fuel runs out.
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
    this.thermal();
  }

  private powder(i: number, x: number, y: number, m: number): void {
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
        if (mat[j2] === M.water) { life[i] = 0; this.convert(j2, M.steam); return; }
        if (FLAMMABLE[mat[j2]] > 0 && this.rand() < FLAMMABLE[mat[j2]] * 0.3) this.ignite(j2);
      }
      if (--life[i] === 0) this.convert(i, this.rand() < 0.3 ? M.ash : M.air, true);
      return;
    }
    if (m === M.plant) this.grow(i, x, y);
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
