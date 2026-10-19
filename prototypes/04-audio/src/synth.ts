// Bob's voices, synthesised with Web Audio from the cues each frame: no clips. Continuous voices
// (roll, wobble, charge, water, sizzle) are filters over noise and oscillators whose levels follow
// the cues; events (landing, jump, splash, tear) are short shaped bursts.
import type { Cues, Ground } from "./listen.ts";

export const VOICES = ["roll", "goo", "land", "jump", "charge", "water", "sizzle", "tear"] as const;
export type Voice = (typeof VOICES)[number];

/** Each ground's roll: the band of noise it rustles in, and how gritty it is. */
const ROLL: Record<Ground, { f: number; q: number; gain: number }> = {
  soft: { f: 450, q: 2, gain: 0.45 },
  hard: { f: 1100, q: 2.5, gain: 0.4 },
  slick: { f: 2600, q: 5, gain: 0.25 },
  sticky: { f: 320, q: 3, gain: 0.55 },
  sharp: { f: 2200, q: 5, gain: 0.3 },
};

/** A small seeded generator: audio isn't the sim, but nothing here needs Math.random either. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class Synth {
  readonly ctx: BaseAudioContext;
  readonly on: Record<Voice, boolean> = Object.fromEntries(VOICES.map((v) => [v, true])) as Record<Voice, boolean>;
  private master: GainNode;
  private noise: AudioBuffer;
  private rand = lcg(7);
  private rollF: BiquadFilterNode; private rollG: GainNode;
  private gooF: BiquadFilterNode; private gooG: GainNode; private gooO: OscillatorNode; private gooOG: GainNode;
  private chO: OscillatorNode; private chG: GainNode;
  private wetF: BiquadFilterNode; private wetG: GainNode;
  private sizF: BiquadFilterNode; private sizG: GainNode;
  private nextBubble = 0;
  /** One-shots playing, for the cost readout. */
  live = 0;

  /** On the page's own context, or an offline one to render a run to a file. */
  constructor(volume = 0.6, ctx: BaseAudioContext = new AudioContext({ latencyHint: "interactive" })) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(comp).connect(ctx.destination);
    // Two seconds of white noise, shared by every voice.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0), r = lcg(1);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;

    [this.rollF, this.rollG] = this.bed("bandpass", 700, 1);
    [this.gooF, this.gooG] = this.bed("lowpass", 260, 0.7);
    // A low wet throb under the wobble.
    this.gooO = ctx.createOscillator(); this.gooO.type = "sine"; this.gooO.frequency.value = 70;
    this.gooOG = ctx.createGain(); this.gooOG.gain.value = 0;
    this.gooO.connect(this.gooOG).connect(this.master); this.gooO.start();
    // Winding up: a soft rising squeeze.
    this.chO = ctx.createOscillator(); this.chO.type = "triangle"; this.chO.frequency.value = 90;
    const chF = ctx.createBiquadFilter(); chF.type = "lowpass"; chF.frequency.value = 500;
    this.chG = ctx.createGain(); this.chG.gain.value = 0;
    this.chO.connect(chF).connect(this.chG).connect(this.master); this.chO.start();
    [this.wetF, this.wetG] = this.bed("lowpass", 500, 0.5);
    [this.sizF, this.sizG] = this.bed("highpass", 4200, 0.7);
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

  /** Follow this frame's cues. */
  update(c: Cues): void {
    const t = this.ctx.currentTime, k = 0.03, on = this.on;
    const g = ROLL[c.ground];
    this.rollF.frequency.setTargetAtTime(g.f * (0.6 + Math.min(1.5, c.speed / 100)), t, k);
    this.rollF.Q.setTargetAtTime(g.q, t, 0.1);
    // A little flutter as he turns over, so it isn't a steady hiss.
    const flutter = 0.75 + 0.25 * Math.sin(t * Math.max(4, c.speed * 0.4));
    this.rollG.gain.setTargetAtTime(on.roll ? c.roll * g.gain * 0.5 * flutter : 0, t, k);
    this.gooF.frequency.setTargetAtTime(180 + 500 * c.wobble, t, k);
    this.gooG.gain.setTargetAtTime(on.goo ? c.wobble * 0.7 : 0, t, k);
    this.gooO.frequency.setTargetAtTime(55 + 60 * c.wobble + 8 * Math.sin(t * 23), t, k);
    this.gooOG.gain.setTargetAtTime(on.goo ? c.wobble * 0.35 : 0, t, k);
    this.chO.frequency.setTargetAtTime(80 + 140 * c.charge, t, k);
    this.chG.gain.setTargetAtTime(on.charge ? Math.min(1, c.charge * 1.5) * 0.12 : 0, t, k);
    this.wetF.frequency.setTargetAtTime(300 + 600 * c.wet, t, k);
    this.wetG.gain.setTargetAtTime(on.water ? c.wet * 0.35 : 0, t, k);
    // Sizzle crackles: its level jitters every frame.
    this.sizG.gain.setTargetAtTime(on.sizzle ? c.sizzle * (0.05 + 0.2 * this.rand() ** 3) : 0, t, 0.01);

    if (c.impact && on.land) this.splat(c.impact, c.impactOn);
    if (c.jump && on.jump) this.boing(c.jump);
    if (c.splash && on.water) this.splash(c.splash);
    if (c.tear && on.tear) this.rip(c.tear);
    if (on.water && c.wet > 0.1 && t > this.nextBubble) {
      this.bubble(0.3 + c.wet * 0.5);
      this.nextBubble = t + 0.04 + (0.5 - c.wet * 0.4) * this.rand();
    }
  }

  /** A burst of filtered noise with a gain envelope; `sweep` moves the filter over it. */
  private burst(dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, at = this.ctx.currentTime): void {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at, this.rand() * 1.5, dur + 0.05);
    this.track(src);
  }

  /** A pitched blip: a sine gliding from f0 to f1. */
  private blip(dur: number, f0: number, f1: number, peak: number, type: OscillatorType = "sine", at = this.ctx.currentTime): void {
    const ctx = this.ctx, osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at); osc.stop(at + dur + 0.05);
    this.track(osc);
  }

  private track(n: AudioScheduledSourceNode): void {
    this.live++;
    n.onended = () => { this.live--; n.disconnect(); };
  }

  /** Landing: a wet splat, lower and longer the harder he hits, and drier on hard ground. */
  private splat(speed: number, on: Ground): void {
    const s = Math.min(1, speed / 260), hard = on === "hard" || on === "slick";
    this.burst(0.08 + 0.12 * s, "lowpass", 1800 + 1400 * s, 220, 1.2, 0.25 + 0.55 * s);
    this.blip(0.1 + 0.1 * s, 190 - 60 * s, 60, (hard ? 0.25 : 0.45) * (0.3 + 0.7 * s));
    if (on === "sticky") this.burst(0.18, "bandpass", 500, 260, 4, 0.2 * s + 0.05);
  }

  /** Take-off: a springy rising blorp, bigger with the charge; a tap is a small bloop. */
  private boing(charge: number): void {
    const c = Math.min(1, charge);
    this.blip(0.12 + 0.12 * c, 150 + 40 * c, 320 + 260 * c, 0.2 + 0.25 * c);
    this.burst(0.06, "highpass", 1200, 2400, 0.7, 0.08 + 0.1 * c);
  }

  /** Into water: a slap of noise and a few bubbles after it. */
  private splash(speed: number): void {
    const s = Math.min(1, speed / 200);
    this.burst(0.25 + 0.2 * s, "bandpass", 2400, 500, 0.8, 0.2 + 0.4 * s);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3 + Math.round(4 * s); i++) this.bubble(0.5 + 0.5 * s, t + 0.05 + i * (0.03 + 0.05 * this.rand()));
  }

  /** One bubble: a sine chirping up, the sound of a small cavity closing. */
  private bubble(size: number, at = this.ctx.currentTime): void {
    const f = 300 + 900 * (1 - size) * (0.6 + 0.8 * this.rand());
    this.blip(0.03 + 0.04 * size, f, f * 1.9, 0.06 + 0.06 * size, "sine", at);
  }

  /** Torn apart: a sticky rip. */
  private rip(amount: number): void {
    this.burst(0.07 + 0.08 * amount, "bandpass", 3000, 900, 2, 0.15 + 0.3 * amount);
    this.blip(0.05, 900, 300, 0.08 * amount, "sawtooth");
  }
}
