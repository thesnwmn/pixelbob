// The conductor: turns the mood (follow.ts) into notes, a sixteenth at a time. Calm and looping:
// four chords, two bars each, in D, under a melody that walks the pentatonic scale. What the game
// does never switches a part on or off; it moves how likely each note is, how loud, and how high,
// so a part fades in or thins out as smoothly as the mood glides. No DOM and no Web Audio, so it
// runs in Node (`pnpm notes`); band.ts plays what it writes.
import type { Mood } from "./follow.ts";

export const PARTS = ["pad", "bass", "melody", "arp", "bell"] as const;
export type Part = (typeof PARTS)[number];

export interface Note {
  part: Part;
  /** When it starts, in seconds on the conductor's clock. */
  at: number;
  midi: number;
  /** 0..1 */
  vel: number;
  /** How long it's held, in seconds. */
  dur: number;
}

/** The loop: Dmaj9, Bm7, Gmaj7, A7sus4, each two bars, as MIDI notes from the root up. */
const CHORDS = [
  [50, 57, 61, 64, 66],
  [47, 54, 57, 61, 62],
  [43, 50, 54, 57, 59],
  [45, 52, 55, 57, 62],
];
/** D major pentatonic (D E F# A B), as pitch classes. */
const SCALE = [2, 4, 6, 9, 11];
/** Every note of the scale from A3 to D6, for the melody to walk. */
const LADDER: number[] = [];
for (let n = 57; n <= 86; n++) if (SCALE.includes(n % 12)) LADDER.push(n);

const STEPS = 16, BARS_PER_CHORD = 2;
/** How likely a note is on each sixteenth of the bar, before the mood scales it: downbeats, then
 *  beats, then eighths, then the sixteenths, which only a lot of energy reaches. */
const WEIGHT = [1, 0.1, 0.35, 0.1, 0.7, 0.1, 0.35, 0.15, 0.85, 0.1, 0.35, 0.1, 0.7, 0.15, 0.4, 0.2];

/** A small seeded generator: the music isn't the sim, but nothing here uses Math.random. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Conductor {
  /** The clock time of the next sixteenth. */
  next = 0;
  /** Sixteenths since the start. */
  step = 0;
  private rand: () => number;
  /** Where the melody is on the ladder. */
  private at = 7;
  /** The bar before's melody, as moves on the ladder by step, so a phrase can come back. */
  private last: (number | null)[] = new Array(STEPS).fill(null);
  private bar: (number | null)[] = new Array(STEPS).fill(null);
  private arpAt = 0;
  /** Notes written so far, by part, for the readout and `pnpm notes`. */
  readonly count: Record<Part, number> = { pad: 0, bass: 0, melody: 0, arp: 0, bell: 0 };

  constructor(seed = 1, start = 0) {
    this.rand = lcg(seed);
    this.next = start;
  }

  /** Beats a minute: 76, a little quicker with speed and slower under water. */
  bpm(m: Mood): number {
    return 76 + 8 * m.energy - 14 * m.wet;
  }

  /** Writes every sixteenth that starts before `until` (seconds), with the mood as it is now. */
  advance(m: Mood, until: number, out: Note[] = []): Note[] {
    while (this.next < until) {
      const len = 60 / this.bpm(m) / 4;
      this.write(m, this.next, len, out);
      this.next += len;
      this.step++;
    }
    return out;
  }

  private write(m: Mood, t: number, len: number, out: Note[]): void {
    const s = this.step % STEPS, barN = Math.floor(this.step / STEPS);
    const chord = CHORDS[Math.floor(barN / BARS_PER_CHORD) % CHORDS.length];
    const r = this.rand;
    const push = (part: Part, midi: number, vel: number, dur: number) => {
      if (vel <= 0.01) return;
      out.push({ part, at: t, midi, vel: Math.min(1, vel), dur });
      this.count[part]++;
    };
    if (s === 0) {
      [this.last, this.bar] = [this.bar, this.last];
      this.bar.fill(null);
    }

    // The pad: the chord, held for its two bars, always there. Under water it's all that's left.
    if (s === 0 && barN % BARS_PER_CHORD === 0)
      for (const n of chord.slice(1)) push("pad", n, 0.5 + 0.2 * m.warmth, len * STEPS * BARS_PER_CHORD + 0.6);

    // The bass comes in over the first stretch of the level and walks a little with speed.
    const bass = smooth(0.03, 0.3, m.progress) * (1 - 0.5 * m.rest);
    if (s === 0) push("bass", chord[0] - 12, 0.75 * bass, len * 10);
    else if (s === 8 && r() < 0.3 + 0.6 * m.energy) push("bass", chord[0] - 12 + (r() < 0.5 ? 7 : 12), 0.55 * bass, len * 6);
    else if (s === 14 && r() < 0.5 * m.energy) push("bass", chord[0] - 12 + 7, 0.4 * bass, len * 2);

    // The melody: a note here as likely as the beat's weight, the energy and the progress make it,
    // thinning out as he rests or sinks, and held long in the air.
    const busy = (0.25 + 0.75 * m.energy) * (0.55 + 0.45 * smooth(0, 0.5, m.progress)) * (1 - 0.85 * m.rest) * (1 - 0.7 * m.wet) * (1 - 0.5 * m.air);
    // Sixteenths only with real speed.
    const w = WEIGHT[s] * (WEIGHT[s] < 0.3 ? smooth(0.4, 0.9, m.energy) : 1);
    if (r() < w * busy * 1.5) {
      // Half the time it repeats the bar before's move here, so phrases come back.
      const echo = this.last[s];
      let move = echo !== null && r() < 0.5 ? echo : Math.round((r() - 0.5) * 4);
      // Drift towards the register his height asks for: higher over the hilltops.
      const want = Math.round(4 + m.height * 9 + m.air * 3);
      if (this.at + move < want - 3) move = Math.abs(move) || 1;
      if (this.at + move > want + 3) move = -Math.abs(move) || -1;
      this.at = Math.max(0, Math.min(LADDER.length - 1, this.at + move));
      this.bar[s] = move;
      let n = LADDER[this.at];
      // On the downbeat, lean onto a note of the chord.
      if (s === 0 || s === 8) n = nearest(n, chord);
      const strong = s % 4 === 0 ? 1 : 0.75;
      push("melody", n, (0.45 + 0.35 * m.energy) * strong, len * (1.5 + 4 * m.air + 2 * m.rest));
    }

    // Winding up: the chord's notes climb, every sixteenth, faster and higher the more he's charged.
    if (m.wind > 0.05 && r() < 0.6 + 0.4 * m.wind) {
      const tones = chord.slice(1);
      const n = tones[this.arpAt % tones.length] + 12 * (1 + Math.floor(this.arpAt / tones.length) % 2);
      this.arpAt++;
      push("arp", n, 0.25 + 0.5 * m.wind, len * 1.2);
    } else if (m.wind < 0.02) this.arpAt = 0;

    // A bell high above, more often the further through the level he is: the level's end coming.
    const bell = smooth(0.35, 0.95, m.progress) * (1 - 0.6 * m.wet);
    if ((s === 0 || s === 10) && r() < 0.15 + 0.6 * bell) push("bell", chord[1 + Math.floor(r() * 4)] + 24, 0.5 * bell + 0.04, len * 8);
  }
}

/** The note of the chord (in any octave) nearest to `n`. */
function nearest(n: number, chord: number[]): number {
  let best = n, d = 99;
  for (const c of chord) {
    const k = c + 12 * Math.round((n - c) / 12);
    if (Math.abs(k - n) < d) { d = Math.abs(k - n); best = k; }
  }
  return best;
}
