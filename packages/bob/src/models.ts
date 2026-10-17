import { Lattice } from "./blob.ts";
import { Goo } from "./goo.ts";
import type { BobModel, ModelKind } from "./model.ts";
import { DEFAULTS, type Tweaks } from "./tweaks.ts";

/** The ways of modelling Bob, for the playground to switch between (docs/09-bob-models.md). */
export const MODELS: { kind: ModelKind; name: string; blurb: string; ignores: (keyof Tweaks)[] }[] = [
  { kind: "lattice", name: "Lattice (v1)", blurb: "A solid with a remembered rest shape: bonds plus shape matching.", ignores: ["stringy"] },
  { kind: "goo", name: "Goo (v2)", blurb: "A viscoelastic fluid: springs that flow, surface tension, a will to be round.", ignores: [] },
];

/** The model the playground starts with. */
export const DEFAULT_MODEL: ModelKind = "goo";

export function createBob(kind: ModelKind, tweaks: Tweaks = DEFAULTS, seed = 1): BobModel {
  switch (kind) {
    case "goo": return new Goo(tweaks, seed);
    default: return new Lattice(tweaks, seed);
  }
}
