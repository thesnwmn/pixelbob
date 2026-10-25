// Exact copies of simulation state, so a search can branch from a point in a run instead of
// replaying it from the start (the bots, game/src/bot.ts). A class's copy() calls copyFields,
// which copies every own field: a new field is copied without anyone remembering to, and one
// it can't copy (a Map, a function, another class's object) throws instead of being shared.

type Fields = Record<string, unknown>;

function deep(v: unknown, path: string): unknown {
  if (v === null || typeof v !== "object") {
    if (typeof v === "function") throw new Error(`copy: ${path} is a function`);
    return v;
  }
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice(): unknown }).slice();
  if (Array.isArray(v)) return v.map((x, i) => deep(x, `${path}[${i}]`));
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw new Error(`copy: ${path} is a ${proto.constructor?.name ?? "class"}, which needs its own copy()`);
  const c: Fields = {};
  for (const k of Object.keys(v)) c[k] = deep((v as Fields)[k], `${path}.${k}`);
  return c;
}

/**
 * Copies every own field of `src` onto `dst`: typed arrays, arrays and plain objects deeply,
 * numbers, strings, booleans and null as they are. `given` supplies fields that mustn't be
 * copied this way (a reference to another object being copied, say).
 */
export function copyFields<T extends object>(src: T, dst: T, given: Record<string, unknown> = {}): T {
  const s = src as Fields, d = dst as Fields, g = given as Fields;
  for (const k of Object.keys(s)) d[k] = k in g ? g[k] : deep(s[k], `${src.constructor.name}.${k}`);
  return dst;
}
