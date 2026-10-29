// The band: plays what the conductor writes (score.ts) with Web Audio, no clips. A pad of soft
// detuned saws, a round sine bass, a melody on a kalimba-like mallet, a climbing arpeggio for the
// wind-up and an FM bell, through an echo and a hall. The mood turns the band's knobs every frame
// (the pad's filter, the hall, how dark it all is), always gliding. It sits under Bob: a dip
// where his squelches live (around 350 Hz), and it ducks for a moment when he lands or jumps.
import type { Mood } from "./follow.ts";
import { type Note, PARTS, type Part, lcg } from "./score.ts";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Band {
  readonly ctx: BaseAudioContext;
  readonly on: Record<Part, boolean> = Object.fromEntries(PARTS.map((p) => [p, true])) as Record<Part, boolean>;
  private bus: GainNode;
  private tone: BiquadFilterNode;
  private ducker: GainNode;
  private padBus: GainNode; private padLP: BiquadFilterNode;
  private echo: DelayNode; private echoBack: GainNode; private echoSend: GainNode;
  private hall: ConvolverNode; private hallSend: GainNode;
  /** Notes sounding now, for the readout. */
  live = 0;

  constructor(volume = 0.3, ctx: BaseAudioContext = new AudioContext({ latencyHint: "interactive" })) {
    this.ctx = ctx;
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -18; out.ratio.value = 2.5; out.attack.value = 0.02; out.release.value = 0.3;
    this.bus = ctx.createGain(); this.bus.gain.value = volume;
    this.tone = ctx.createBiquadFilter(); this.tone.type = "lowpass"; this.tone.frequency.value = 5000; this.tone.Q.value = 0.4;
    // Leave room for Bob: his squelches and pats sit around 200 to 600 Hz.
    const carve = ctx.createBiquadFilter(); carve.type = "peaking"; carve.frequency.value = 350; carve.Q.value = 0.9; carve.gain.value = -8;
    this.ducker = ctx.createGain();
    this.bus.connect(this.tone).connect(carve).connect(this.ducker).connect(out).connect(ctx.destination);

    this.padLP = ctx.createBiquadFilter(); this.padLP.type = "lowpass"; this.padLP.frequency.value = 700; this.padLP.Q.value = 0.7;
    this.padBus = ctx.createGain(); this.padBus.gain.value = 1;
    this.padBus.connect(this.padLP).connect(this.bus);

    // A dotted-eighth echo, darkened each time round.
    this.echo = ctx.createDelay(2); this.echo.delayTime.value = 0.59;
    const echoLP = ctx.createBiquadFilter(); echoLP.type = "lowpass"; echoLP.frequency.value = 2200;
    this.echoBack = ctx.createGain(); this.echoBack.gain.value = 0.35;
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0.3;
    this.echoSend.connect(this.echo).connect(echoLP).connect(this.echoBack).connect(this.echo);
    echoLP.connect(this.bus);

    // A hall: two seconds of seeded noise, fading (a longer one costs more than the rest of the band).
    this.hall = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c), r = lcg(11 + c);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.hall.buffer = ir;
    this.hallSend = ctx.createGain(); this.hallSend.gain.value = 0.35;
    this.hallSend.connect(this.hall).connect(this.bus);
  }

  set volume(v: number) { this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** Turn the knobs the mood moves: every one glides. */
  follow(m: Mood): void {
    const t = this.ctx.currentTime, k = 0.25;
    // The pad opens with speed and warmth and closes under water.
    this.padLP.frequency.setTargetAtTime((450 + 900 * m.energy + 500 * m.warmth + 400 * m.height) * (1 - 0.6 * m.wet), t, k);
    // Everything darkens under water.
    this.tone.frequency.setTargetAtTime(5000 * (1 - 0.8 * m.wet), t, k);
    // More hall in the air and at rest; more echo at speed.
    this.hallSend.gain.setTargetAtTime(0.3 + 0.35 * m.air + 0.2 * m.rest + 0.3 * m.wet, t, k);
    this.echoSend.gain.setTargetAtTime(0.2 + 0.25 * m.energy, t, k);
  }

  /** Dip the band for a moment, by `x` (0..1), so a landing or a jump is heard over it. */
  duck(x: number): void {
    const t = this.ctx.currentTime, g = this.ducker.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - 0.45 * Math.min(1, x), t, 0.01);
    g.setTargetAtTime(1, t + 0.12, 0.35);
  }

  play(n: Note): void {
    if (!this.on[n.part]) return;
    const ctx = this.ctx, f = hz(n.midi), t = Math.max(n.at, ctx.currentTime);
    switch (n.part) {
      case "pad": {
        // Two saws a few cents apart and a sine under them, swelling in and out slowly.
        const g = ctx.createGain(), peak = 0.05 * n.vel, end = t + n.dur;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 1.6);
        g.gain.setValueAtTime(peak, end - 1.5);
        g.gain.linearRampToValueAtTime(0, end);
        g.connect(this.padBus);
        g.connect(this.hallSend);
        for (const [type, cents, lvl] of [["sawtooth", -7, 0.6], ["sawtooth", 7, 0.6], ["sine", 0, 1]] as const) {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents;
          const og = ctx.createGain(); og.gain.value = lvl;
          o.connect(og).connect(g); o.start(t); o.stop(end + 0.05);
          if (cents === 0) this.track(o);
        }
        break;
      }
      case "bass": {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = f * 2;
        const g2 = ctx.createGain(); g2.gain.value = 0.15;
        const g = this.env(0.22 * n.vel, t, 0.03, n.dur);
        o.connect(g); o2.connect(g2).connect(g); g.connect(this.bus);
        o.start(t); o2.start(t); o.stop(t + n.dur + 0.1); o2.stop(t + n.dur + 0.1);
        this.track(o);
        break;
      }
      case "melody": {
        // A mallet: the note, and a quick bright overtone at four times it that dies first.
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = this.env(0.12 * n.vel, t, 0.006, n.dur);
        const ov = ctx.createOscillator(); ov.type = "sine"; ov.frequency.value = f * 4.01;
        const og = this.env(0.03 * n.vel, t, 0.002, 0.12);
        o.connect(g); ov.connect(og);
        for (const node of [g, og]) { node.connect(this.bus); node.connect(this.echoSend); node.connect(this.hallSend); }
        o.start(t); ov.start(t); o.stop(t + n.dur + 0.1); ov.stop(t + 0.2);
        this.track(o);
        break;
      }
      case "arp": {
        const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        const g = this.env(0.05 * n.vel, t, 0.01, n.dur);
        o.connect(g); g.connect(this.bus); g.connect(this.echoSend);
        o.start(t); o.stop(t + n.dur + 0.1);
        this.track(o);
        break;
      }
      case "bell": {
        // FM: a sine bent by another at 3.5 times it, the bend fading faster than the note.
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const mod = ctx.createOscillator(); mod.type = "sine"; mod.frequency.value = f * 3.5;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(f * 1.2, t);
        depth.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
        mod.connect(depth).connect(o.frequency);
        const g = this.env(0.045 * n.vel, t, 0.004, n.dur);
        o.connect(g); g.connect(this.bus); g.connect(this.hallSend);
        o.start(t); mod.start(t); o.stop(t + n.dur + 0.1); mod.stop(t + n.dur + 0.1);
        this.track(o);
        break;
      }
    }
  }

  /** A gain that rises in `attack` and fades away over `dur`. */
  private env(peak: number, t: number, attack: number, dur: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    return g;
  }

  private track(o: OscillatorNode): void {
    this.live++;
    o.onended = () => { this.live--; };
  }
}
