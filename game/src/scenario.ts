// The scenario format: a start point in the game, with a handoff card for the playtester.
// One JSON file per scenario in game/scenarios/, named by its id; `?scenario=<id>` starts
// there. See studio/README.md#scenarios-putting-you-where-the-change-is.
//
// No imports, so the health check can run `parseScenario` on the files from Node.

/** The levels a scenario can name, and their width in cells: the course, and each folder in game/levels/. Each is built by `LEVELS` in levels.ts (a test keeps them in step). */
export const LEVEL_WIDTHS = { course: 1880, tiny: 160 } as const;
export type LevelId = keyof typeof LEVEL_WIDTHS;
export const LEVEL_IDS = Object.keys(LEVEL_WIDTHS) as LevelId[];

/** The renderer's lighting presets (`LOOKS` in packages/render). */
export const LOOK_IDS = ["day", "dusk", "night", "work"] as const;
export type LookId = (typeof LOOK_IDS)[number];

/** Bob's numeric tweaks (`RANGES` in packages/bob), which a scenario may set. */
export const TWEAK_KEYS = ["cohesion", "memory", "softness", "muscle", "grip", "speed", "jump", "air", "hop", "size", "gravity", "soak", "hold", "stringy"] as const;
export type TweakKey = (typeof TWEAK_KEYS)[number];

/** What the playtester reads before playing: what changed, what to try, what to look for. */
export interface Card {
  changed: string;
  try: string[];
  lookFor: string[];
  known: string[];
  /** Asked again in the feedback form, so the answers come back with the report. */
  questions: string[];
}

export interface Scenario {
  id: string;
  title: string;
  level: LevelId;
  /** Bob's seed, and the course's (a painted level has its own). */
  seed: number;
  /** Where Bob starts, in cells across the level; he's put on the ground there. Omitted: the level's spawn. */
  at?: number;
  bob: {
    /** Held at this temperature (°C), whatever the world does. Omitted: the world's temperature. */
    temp?: number;
    tweaks: Partial<Record<TweakKey, number>>;
    drive?: "roll" | "crawl";
  };
  camera: { zoom: number; look: LookId };
  card?: Card;
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Checks a scenario file's contents; returns the scenario, or what's wrong with it. */
export function parseScenario(id: string, raw: unknown): { scenario?: Scenario; errors: string[] } {
  const errors: string[] = [];
  const bad = (msg: string) => errors.push(msg);
  if (!ID.test(id)) bad(`the id "${id}" (the file name) isn't kebab-case`);
  if (!isObject(raw)) return { errors: [...errors, "not a JSON object"] };
  unknownKeys(raw, ["title", "level", "seed", "at", "bob", "camera", "card"], "", bad);

  const title = raw.title;
  if (typeof title !== "string" || !title.trim()) bad("title: a non-empty string");
  const level = raw.level;
  if (!LEVEL_IDS.includes(level as LevelId)) bad(`level: one of ${LEVEL_IDS.join(", ")}`);
  const seed = raw.seed ?? 7;
  if (!Number.isInteger(seed)) bad("seed: an integer");
  const at = raw.at;
  const width = LEVEL_WIDTHS[level as LevelId];
  if (at !== undefined && !(typeof at === "number" && at > 0 && (!width || at < width))) bad(`at: a number of cells across the level${width ? `, 1 to ${width - 1}` : ""}`);

  const rawBob = raw.bob ?? {};
  const bob: Scenario["bob"] = { tweaks: {} };
  if (!isObject(rawBob)) bad("bob: an object");
  else {
    unknownKeys(rawBob, ["temp", "tweaks", "drive"], "bob.", bad);
    if (rawBob.temp !== undefined) {
      if (typeof rawBob.temp === "number" && rawBob.temp >= -50 && rawBob.temp <= 200) bob.temp = rawBob.temp;
      else bad("bob.temp: a temperature in °C, -50 to 200");
    }
    if (rawBob.drive !== undefined) {
      if (rawBob.drive === "roll" || rawBob.drive === "crawl") bob.drive = rawBob.drive;
      else bad('bob.drive: "roll" or "crawl"');
    }
    const tweaks = rawBob.tweaks ?? {};
    if (!isObject(tweaks)) bad("bob.tweaks: an object");
    else
      for (const [k, v] of Object.entries(tweaks)) {
        if (!TWEAK_KEYS.includes(k as TweakKey)) bad(`bob.tweaks.${k}: not one of Bob's tweaks (${TWEAK_KEYS.join(", ")})`);
        else if (typeof v !== "number" || !Number.isFinite(v)) bad(`bob.tweaks.${k}: a number`);
        else bob.tweaks[k as TweakKey] = v;
      }
  }

  const rawCam = raw.camera ?? {};
  const camera: Scenario["camera"] = { zoom: 3, look: "day" };
  if (!isObject(rawCam)) bad("camera: an object");
  else {
    unknownKeys(rawCam, ["zoom", "look"], "camera.", bad);
    if (rawCam.zoom !== undefined) {
      if (typeof rawCam.zoom === "number" && rawCam.zoom >= 1 && rawCam.zoom <= 8) camera.zoom = rawCam.zoom;
      else bad("camera.zoom: 1 to 8");
    }
    if (rawCam.look !== undefined) {
      if (LOOK_IDS.includes(rawCam.look as LookId)) camera.look = rawCam.look as LookId;
      else bad(`camera.look: one of ${LOOK_IDS.join(", ")}`);
    }
  }

  let card: Card | undefined;
  if (raw.card !== undefined) {
    const c = raw.card;
    if (!isObject(c)) bad("card: an object");
    else {
      unknownKeys(c, ["changed", "try", "lookFor", "known", "questions"], "card.", bad);
      if (typeof c.changed !== "string" || !c.changed.trim()) bad("card.changed: a non-empty string");
      const list = (k: string): string[] => {
        const v = c[k] ?? [];
        if (Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim())) return v;
        bad(`card.${k}: a list of non-empty strings`);
        return [];
      };
      card = { changed: String(c.changed ?? ""), try: list("try"), lookFor: list("lookFor"), known: list("known"), questions: list("questions") };
    }
  }

  if (errors.length) return { errors };
  return { scenario: { id, title: title as string, level: level as LevelId, seed: seed as number, at: at as number | undefined, bob, camera, card }, errors };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function unknownKeys(o: Record<string, unknown>, known: string[], prefix: string, bad: (msg: string) => void) {
  for (const k of Object.keys(o)) if (!known.includes(k)) bad(`${prefix}${k}: not a field (${known.join(", ")})`);
}
