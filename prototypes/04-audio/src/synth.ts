// Bob's voices, synthesised with Web Audio from the cues each frame: no clips. Wet and muffled:
// everything goes through a low-pass (the muffle), attacks are soft, and the wet sounds are noise
// through resonant low-passes that sweep, which gurgles like a hand in slime. Continuous voices
// (goo, charge, water, sizzle) are filters over noise and oscillators whose levels follow the cues;
// the roll comes in pulses as his surface turns over onto the ground; events (landing, jump, splash,
// tear) are short shaped squelches. Roll, landing and jump each have a few takes to pick from.
import type { Cues, Ground } from "./listen.ts";

export const VOICES = ["roll", "goo", "land", "jump", "charge", "water", "sizzle", "tear"] as const;
export type Voice = (typeof VOICES)[number];

/** The takes the soundboard offers for each voice that has them, the first being the default. */
export const TAKES = {
  roll: ["pat", "patter", "smear"],
  land: ["squelch", "plop", "splat"],
  jump: ["unstick", "slurp", "pop"],
} as const;
export type Takes = { -readonly [V in keyof typeof TAKES]: (typeof TAKES)[V][number] };
export const DEFAULT_TAKES: Takes = { roll: "pat", land: "squelch", jump: "unstick" };
/** What each take is, for the soundboard. */
export const TAKE_NOTES: Record<string, string> = {
  pat: "a damp pat each time he turns over",
  patter: "tiny suction pops as his skin peels off the ground",
  smear: "a low continuous smear that swells as he turns over",
  squelch: "a gurgling squelch, longer the harder he lands",
  plop: "a deep liquid plop and a bubble or two",
  splat: "a soft slap with drips after it",
  unstick: "a suction release, peeling off the ground",
  slurp: "two quick stretchy gurgles",
  pop: "one low cavity pop",
};

export const GROUNDS: Ground[] = ["soft", "hard", "slick", "sticky", "sharp"];
/** How each ground colours the roll, landing and jump: how bright (scales the filters), how wet
 *  (resonance and gurgle), and how loud. Grass and moss pat, rock is drier and quieter, ice is
 *  barely heard, resin and gum are the wettest. */
const GROUND: Record<Ground, { bright: number; wet: number; level: number }> = {
  soft: { bright: 0.8, wet: 0.6, level: 1 },
  hard: { bright: 1.15, wet: 0.2, level: 0.45 },
  slick: { bright: 1.3, wet: 0.1, level: 0.2 },
  sticky: { bright: 0.65, wet: 1, level: 1.2 },
  sharp: { bright: 1.3, wet: 0.3, level: 0.6 },
};

/** Contacts made (and half of those lost) that add up to one pulse of the roll. */
const TURN = 14;

/** A small seeded generator: audio isn't the sim, but nothing here needs Math.random either. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class Synth {
  readonly ctx: BaseAudioContext;
  readonly on: Record<Voice, boolean> = Object.fromEntries(VOICES.map((v) => [v, true])) as Record<Voice, boolean>;
  readonly takes: Takes = { ...DEFAULT_TAKES };
  private master: GainNode;
  private muffler: BiquadFilterNode;
  private noise: AudioBuffer;
  private rand = lcg(7);
  private smearF: BiquadFilterNode; private smearG: GainNode;
  private gooF: BiquadFilterNode; private gooG: GainNode; private gooO: OscillatorNode; private gooOG: GainNode;
  private chO: OscillatorNode; private chG: GainNode;
  private wetF: BiquadFilterNode; private wetG: GainNode;
  private sizF: BiquadFilterNode; private sizG: GainNode;
  private nextBubble = 0;
  private turned = 0; private turnAt = TURN; private swell = 0; private previewing = 0;
  /** One-shots playing, for the cost readout. */
  live = 0;

  /** On the page's own context, or an offline one to render a run to a file. */
  constructor(volume = 0.6, ctx: BaseAudioContext = new AudioContext({ latencyHint: "interactive" }), muffle = 1500) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.knee.value = 12;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.muffler = ctx.createBiquadFilter();
    this.muffler.type = "lowpass"; this.muffler.frequency.value = muffle; this.muffler.Q.value = 0.5;
    this.master.connect(this.muffler).connect(comp).connect(ctx.destination);
    // Two seconds of white noise, shared by every voice.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0), r = lcg(1);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;

    [this.smearF, this.smearG] = this.bed("lowpass", 300, 2);
    [this.gooF, this.gooG] = this.bed("lowpass", 200, 4);
    // A low wet throb under the wobble.
    this.gooO = ctx.createOscillator(); this.gooO.type = "sine"; this.gooO.frequency.value = 70;
    this.gooOG = ctx.createGain(); this.gooOG.gain.value = 0;
    this.gooO.connect(this.gooOG).connect(this.master); this.gooO.start();
    // Winding up: a soft, low rising squeeze.
    this.chO = ctx.createOscillator(); this.chO.type = "triangle"; this.chO.frequency.value = 70;
    const chF = ctx.createBiquadFilter(); chF.type = "lowpass"; chF.frequency.value = 320; chF.Q.value = 3;
    this.chG = ctx.createGain(); this.chG.gain.value = 0;
    this.chO.connect(chF).connect(this.chG).connect(this.master); this.chO.start();
    [this.wetF, this.wetG] = this.bed("lowpass", 400, 0.5);
    [this.sizF, this.sizG] = this.bed("bandpass", 3000, 0.8);
  }

  /** A looping noise bed through a filter, silent until a cue raises it. */
  private bed(type: BiquadFilterType, f: number, q: number): [BiquadFilterNode, GainNode] {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.loopStart = this.rand() * 1.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = f; filter.Q.value = q;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(0, this.rand() * 1.5);
    return [filter, gain];
  }

  set volume(v: number) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  /** The low-pass over everything (Hz): lower is more muffled. */
  set muffle(f: number) { this.muffler.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05); }

  /** Follow this frame's cues. */
  update(c: Cues): void {
    const t = this.ctx.currentTime, k = 0.03, on = this.on, g = GROUND[c.ground];
    // The roll: a pulse each time enough of his surface has turned over onto the ground.
    if (c.roll > 0.03) this.turned += c.touch + 0.5 * c.peel;
    else this.turned = 0;
    if (this.turned >= this.turnAt) {
      this.turned = 0; this.turnAt = TURN * (0.8 + 0.4 * this.rand());
      if (on.roll) this.turn(c.roll, c.ground, c.speed);
    }
    // The smear take's bed swells on each pulse and sinks between them.
    this.swell *= 0.85;
    const smear = on.roll && this.takes.roll === "smear" ? c.roll * g.level * (0.04 + 0.1 * this.swell) : 0;
    this.smearF.frequency.setTargetAtTime(g.bright * (200 + 150 * Math.min(1, c.speed / 100) + 150 * this.swell), t, k);
    this.smearF.Q.setTargetAtTime(1.5 + 5 * g.wet, t, 0.1);
    if (t > this.previewing) this.smearG.gain.setTargetAtTime(smear, t, k);
    // A resonant low-pass wandering over the noise: his insides gurgling as he wobbles.
    this.gooF.frequency.setTargetAtTime((120 + 280 * c.wobble) * (1 + 0.25 * Math.sin(t * 17)), t, k);
    this.gooG.gain.setTargetAtTime(on.goo ? c.wobble * 0.3 : 0, t, k);
    this.gooO.frequency.setTargetAtTime(55 + 50 * c.wobble + 8 * Math.sin(t * 23), t, k);
    this.gooOG.gain.setTargetAtTime(on.goo ? c.wobble * 0.1 : 0, t, k);
    this.chO.frequency.setTargetAtTime(65 + 90 * c.charge, t, k);
    this.chG.gain.setTargetAtTime(on.charge ? Math.min(1, c.charge * 1.5) * 0.07 : 0, t, k);
    this.wetF.frequency.setTargetAtTime(250 + 400 * c.wet, t, k);
    this.wetG.gain.setTargetAtTime(on.water ? c.wet * 0.35 : 0, t, k);
    // Sizzle crackles: its level jitters every frame.
    this.sizG.gain.setTargetAtTime(on.sizzle ? c.sizzle * (0.04 + 0.16 * this.rand() ** 3) : 0, t, 0.01);

    if (c.impact && on.land) this.land(c.impact, c.impactOn);
    if (c.jump && on.jump) this.jump(c.jump, c.ground);
    if (c.splash && on.water) this.splash(c.splash);
    if (c.tear && on.tear) this.rip(c.tear);
    if (on.water && c.wet > 0.1 && t > this.nextBubble) {
      this.bubble(0.3 + c.wet * 0.5);
      this.nextBubble = t + 0.04 + (0.5 - c.wet * 0.4) * this.rand();
    }
  }

  /** Play one take on its own, on a ground: what the soundboard's ▶ does. */
  preview(voice: keyof Takes, take: string, ground: Ground): void {
    const was = this.takes[voice], t = this.ctx.currentTime + 0.05;
    (this.takes as Record<string, string>)[voice] = take;
    if (voice === "roll") {
      // A second and a half of rolling at a steady speed, his surface turning over about 8 times a second.
      for (let i = 0; i < 12; i++) this.turn(0.8, ground, 80, t + i * 0.125 + 0.02 * this.rand());
      if (take === "smear") {
        const g = GROUND[ground];
        this.previewing = t + 1.6;
        this.smearF.frequency.setTargetAtTime(g.bright * 400, t, 0.03);
        this.smearG.gain.setTargetAtTime(0.8 * g.level * 0.09, t, 0.05);
        this.smearG.gain.setTargetAtTime(0, t + 1.5, 0.08);
      }
    } else if (voice === "land") {
      [60, 150, 260].forEach((speed, i) => this.land(speed, ground, t + i * 0.6));
    } else {
      [0.01, 0.5, 1].forEach((charge, i) => this.jump(charge, ground, t + i * 0.6));
    }
    (this.takes as Record<string, string>)[voice] = was;
  }

  /** A burst of filtered noise with a gain envelope; the filter sweeps from f0 to f1 over it. */
  private burst(dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, at = this.ctx.currentTime, attack = 0.015): void {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, f0), at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at, this.rand() * 1.5, dur + 0.05);
    this.track(src);
  }

  /** A squelch: noise through a resonant low-pass sweeping f0 to f1, its level fluttering at `gurgle`
   *  Hz (0 for none), which is what makes it wet rather than a hiss. */
  private squelch(dur: number, f0: number, f1: number, q: number, peak: number, at = this.ctx.currentTime, attack = 0.02, gurgle = 0): void {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, f0), at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain);
    if (gurgle > 0) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain(), am = ctx.createGain();
      lfo.frequency.value = gurgle * (0.85 + 0.3 * this.rand());
      depth.gain.value = 0.5; am.gain.value = 0.5;
      lfo.connect(depth).connect(am.gain);
      gain.connect(am).connect(this.master);
      lfo.start(at); lfo.stop(at + dur + 0.05);
      lfo.onended = () => { lfo.disconnect(); depth.disconnect(); am.disconnect(); };
    } else gain.connect(this.master);
    src.start(at, this.rand() * 1.5, dur + 0.05);
    this.track(src);
  }

  /** A pitched blip: a sine gliding from f0 to f1. */
  private blip(dur: number, f0: number, f1: number, peak: number, at = this.ctx.currentTime, attack = 0.01): void {
    const ctx = this.ctx, osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at); osc.stop(at + dur + 0.05);
    this.track(osc);
  }

  private track(n: AudioScheduledSourceNode): void {
    this.live++;
    n.onended = () => { this.live--; n.disconnect(); };
  }

  /** One pulse of the roll, as loud as he's rolling (0..1), well back in the mix. */
  private turn(roll: number, on: Ground, speed: number, at = this.ctx.currentTime): void {
    const g = GROUND[on], v = Math.min(1, roll * 2.5) * g.level, fast = Math.min(1, speed / 100);
    if (this.takes.roll === "pat") {
      this.squelch(0.06 + 0.03 * g.wet, g.bright * (380 + 200 * fast), g.bright * 150, 3 + 5 * g.wet, 0.3 * v, at, 0.012);
    } else if (this.takes.roll === "patter") {
      const f = g.bright * (220 + 120 * this.rand());
      this.blip(0.025 + 0.02 * g.wet, f, f * (1.3 + 0.4 * g.wet), 0.12 * v, at, 0.006);
      if (this.rand() < g.wet) this.blip(0.02, f * 1.4, f * 2, 0.07 * v, at + 0.03 + 0.03 * this.rand(), 0.005);
    } else this.swell = 1;
  }

  /** Landing, by how hard he hit (px/s) and on what. */
  private land(speed: number, on: Ground, at = this.ctx.currentTime): void {
    const s = Math.min(1, speed / 260), g = GROUND[on], take = this.takes.land;
    const level = 0.6 + 0.4 * g.level;
    if (take === "squelch") {
      this.squelch(0.12 + 0.18 * s, g.bright * (500 + 600 * s), 110, 4 + 6 * g.wet, (0.25 + 0.45 * s) * level, at, 0.02, 14 + 10 * g.wet);
      // The weight of him: a low push of noise, not a tone.
      this.burst(0.1 + 0.08 * s, "lowpass", 220, 70, 1, (0.15 + 0.3 * s) * level, at, 0.015);
    } else if (take === "plop") {
      this.squelch(0.1 + 0.1 * s, g.bright * (700 + 400 * s), 140, 10 + 6 * g.wet, (0.2 + 0.4 * s) * level, at, 0.012);
      const bubbles = Math.round(1 + 2 * s * g.wet);
      for (let i = 0; i < bubbles; i++) this.bubble(0.6, at + 0.08 + i * (0.05 + 0.05 * this.rand()));
    } else {
      this.burst(0.06 + 0.06 * s, "lowpass", g.bright * (1000 + 600 * s), 200, 1.5, (0.2 + 0.4 * s) * level, at, 0.008);
      const drips = Math.round(1 + 2 * s);
      for (let i = 0; i < drips; i++) this.squelch(0.05, g.bright * 600, 200, 6 + 4 * g.wet, (0.06 + 0.1 * s) * level, at + 0.08 + i * (0.06 + 0.06 * this.rand()), 0.01);
    }
    // Resin and gum hold on: a long sticky tail.
    if (on === "sticky") this.squelch(0.25, 260, 120, 8, 0.1 + 0.15 * s, at + 0.05, 0.04, 9);
  }

  /** Take-off, by the charge (a tap is small) and the ground he leaves. */
  private jump(charge: number, from: Ground, at = this.ctx.currentTime): void {
    const c = Math.min(1, charge), g = GROUND[from], take = this.takes.jump;
    const level = 0.6 + 0.4 * g.level;
    if (take === "unstick") {
      this.squelch(0.09 + 0.12 * c, g.bright * 180, g.bright * (450 + 400 * c), 6 + 6 * g.wet, (0.25 + 0.4 * c) * level, at, 0.03, 18 * g.wet);
    } else if (take === "slurp") {
      this.squelch(0.07 + 0.05 * c, g.bright * 200, g.bright * (350 + 200 * c), 7 + 5 * g.wet, (0.2 + 0.3 * c) * level, at, 0.02, 30);
      this.squelch(0.08 + 0.08 * c, g.bright * 260, g.bright * (500 + 300 * c), 7 + 5 * g.wet, (0.16 + 0.25 * c) * level, at + 0.07, 0.02, 30);
    } else {
      this.burst(0.06 + 0.06 * c, "bandpass", g.bright * 220, g.bright * (380 + 200 * c), 10, (0.35 + 0.4 * c) * level, at, 0.01);
    }
  }

  /** Into water: a soft slap and a few bubbles after it. */
  private splash(speed: number): void {
    const s = Math.min(1, speed / 200);
    this.squelch(0.25 + 0.2 * s, 1400, 300, 2, 0.2 + 0.35 * s, this.ctx.currentTime, 0.015, 12);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3 + Math.round(4 * s); i++) this.bubble(0.5 + 0.5 * s, t + 0.05 + i * (0.03 + 0.05 * this.rand()));
  }

  /** One bubble: a low sine chirping up, the sound of a small cavity closing. */
  private bubble(size: number, at = this.ctx.currentTime): void {
    const f = 200 + 500 * (1 - size) * (0.6 + 0.8 * this.rand());
    this.blip(0.03 + 0.04 * size, f, f * 1.7, 0.05 + 0.05 * size, at, 0.008);
  }

  /** Torn apart: a sticky rip, a squelch tearing downwards. */
  private rip(amount: number): void {
    this.squelch(0.08 + 0.08 * amount, 1400, 300, 5, 0.15 + 0.3 * amount, this.ctx.currentTime, 0.008, 40);
  }
}
