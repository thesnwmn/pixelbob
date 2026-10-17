// The studio's state, read from its files, and the board generated from it. `pnpm board`
// prints the board (`--json` for data, `--github` to add open PRs and issues). The
// health check's studio tier uses the same reader, so a file the board can't read is red.
// The formats are in studio/README.md#the-studios-state.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const KINDS = ["think", "shape", "spike", "build", "fix", "test", "tool", "tidy", "release"];
export const ROLES = ["director", "designer", "muse", "art-director", "planner", "prototyper", "engineer", "toolsmith", "tester", "critic", "release"];
export const SIZES = ["S", "M"];
export const UNIT_STATUSES = ["idea", "shaped", "ready", "doing", "review", "playtest", "done", "dropped"];
export const ASK_STATUSES = ["open", "answered", "expired"];
export const MILESTONE_STATUSES = ["proposed", "current", "done", "dropped"];
export const AUTONOMY = ["studio-merges", "review-first"];

export type Value = string | number | boolean | string[];
export type Fields = Record<string, Value>;

export interface Doc {
  /** The file name without `.md`: a unit's, ask's or milestone's ID. */
  slug: string;
  /** Relative to the repo root. */
  path: string;
  fields: Fields;
  /** `## Heading` → the text under it, trimmed. */
  sections: Record<string, string>;
}

export interface Studio {
  units: Doc[];
  asks: Doc[];
  milestones: Doc[];
  sessions: Doc[];
  producer?: Doc;
  direction?: Doc;
  /** `path: what's wrong`, for every file that doesn't follow its format. */
  problems: string[];
}

/** Front matter: `key: value  # comment` lines; a value is `[a, b]`, a number, true/false, or text. */
export function parseFrontMatter(text: string): { fields: Fields; body: string } | undefined {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return undefined;
  const fields: Fields = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) throw new Error(`can't read front matter line "${raw.trim()}"`);
    fields[kv[1]] = parseValue(kv[2]);
  }
  return { fields, body: text.slice(m[0].length) };
}

function parseValue(v: string): Value {
  if (v.startsWith("[")) {
    if (!v.endsWith("]")) throw new Error(`unclosed list "${v}"`);
    return v.slice(1, -1).split(",").map(unquote).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === "true" || v === "false") return v === "true";
  return unquote(v);
}

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

export function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = body.split(/^## +(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) sections[parts[i].trim()] = parts[i + 1].trim();
  return sections;
}

function readDoc(root: string, path: string, problems: string[]): Doc | undefined {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  try {
    const parsed = parseFrontMatter(readFileSync(join(root, path), "utf8"));
    if (!parsed) {
      problems.push(`${path}: no front matter (--- … --- at the top)`);
      return undefined;
    }
    return { slug, path, fields: parsed.fields, sections: parseSections(parsed.body) };
  } catch (e) {
    problems.push(`${path}: ${(e as Error).message}`);
    return undefined;
  }
}

function readDir(root: string, dir: string, problems: string[]): Doc[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((n) => n.endsWith(".md") && n !== "README.md")
    .sort()
    .flatMap((n) => readDoc(root, `${dir}/${n}`, problems) ?? []);
}

/** Checks that `doc.fields[key]` is present (if `required`) and of the right shape. */
function field(doc: Doc, key: string, problems: string[], opts: { required?: boolean; oneOf?: string[]; type?: "string" | "number" | "boolean" | "list" }): void {
  const v = doc.fields[key];
  if (v === undefined || v === "") {
    if (opts.required) problems.push(`${doc.path}: missing ${key}`);
    return;
  }
  const type = opts.type ?? "string";
  const ok = type === "list" ? Array.isArray(v) : typeof v === type;
  if (!ok) problems.push(`${doc.path}: ${key} should be a ${type}, not ${JSON.stringify(v)}`);
  else if (opts.oneOf && !opts.oneOf.includes(String(v))) problems.push(`${doc.path}: ${key} is "${v}", not one of ${opts.oneOf.join(" | ")}`);
}

const list = (v: Value | undefined): string[] => (Array.isArray(v) ? v : []);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function checkUnit(u: Doc, problems: string[]): void {
  const status = String(u.fields.status);
  field(u, "title", problems, { required: true });
  field(u, "kind", problems, { required: true, oneOf: KINDS });
  field(u, "role", problems, { required: true, oneOf: ROLES });
  field(u, "status", problems, { required: true, oneOf: UNIT_STATUSES });
  field(u, "size", problems, { required: status !== "idea" && status !== "dropped", oneOf: SIZES });
  field(u, "milestone", problems, {});
  field(u, "needs", problems, { type: "list" });
  field(u, "issues", problems, { type: "list" });
  field(u, "pr", problems, { required: ["doing", "review", "playtest", "done"].includes(status), type: "number" });
  field(u, "scenario", problems, {});
  if (!SLUG.test(u.slug)) problems.push(`${u.path}: the file name should be a slug (lowercase words and hyphens)`);
  if (!u.sections.Why) problems.push(`${u.path}: no "## Why"`);
  if (!["idea", "dropped"].includes(status)) {
    for (const s of ["Done when", "Not this"]) if (!u.sections[s]) problems.push(`${u.path}: ${status}, so it needs "## ${s}"`);
  }
  if (["done", "dropped"].includes(status) && !u.sections.Log) problems.push(`${u.path}: ${status}, so its "## Log" says why`);
}

function checkAsk(a: Doc, problems: string[]): void {
  field(a, "title", problems, { required: true });
  field(a, "from", problems, { required: true, oneOf: ROLES });
  field(a, "status", problems, { required: true, oneOf: ASK_STATUSES });
  field(a, "blocks", problems, { required: a.fields.status === "open", type: "list" });
  field(a, "default", problems, { required: true });
  field(a, "gated", problems, { required: true, type: "boolean" });
  field(a, "expires", problems, { required: a.fields.gated === false });
  if (a.fields.gated === true && a.fields.status === "expired") problems.push(`${a.path}: gated asks never expire`);
  if (a.fields.status === "open" && !list(a.fields.blocks).length) problems.push(`${a.path}: an open ask names what it blocks`);
  if (a.fields.status === "answered" && !a.sections.Answer) problems.push(`${a.path}: answered, so it needs "## Answer"`);
}

function checkMilestone(m: Doc, problems: string[]): void {
  field(m, "title", problems, { required: true });
  field(m, "status", problems, { required: true, oneOf: MILESTONE_STATUSES });
  for (const s of ["Why", "Scope", "Exit criteria"]) if (!m.sections[s]) problems.push(`${m.path}: no "## ${s}"`);
}

function checkSession(s: Doc, problems: string[]): void {
  field(s, "date", problems, { required: true });
  field(s, "command", problems, { required: true });
  field(s, "units", problems, { type: "list" });
  const date = String(s.fields.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${s.path}: date should be YYYY-MM-DD`);
  else if (!s.slug.startsWith(`${date}-`)) problems.push(`${s.path}: the file name should start with its date, ${date}`);
}

/** Every file in `studio/`, read and checked against its format and against each other. */
export function loadStudio(root: string): Studio {
  const problems: string[] = [];
  const units = readDir(root, "studio/work", problems);
  const asks = readDir(root, "studio/asks", problems);
  const milestones = readDir(root, "studio/milestones", problems);
  const sessions = readDir(root, "studio/sessions", problems);
  const producer = existsSync(join(root, "studio/producer.md")) ? readDoc(root, "studio/producer.md", problems) : undefined;
  const direction = existsSync(join(root, "studio/direction.md")) ? readDoc(root, "studio/direction.md", problems) : undefined;

  units.forEach((u) => checkUnit(u, problems));
  asks.forEach((a) => checkAsk(a, problems));
  milestones.forEach((m) => checkMilestone(m, problems));
  sessions.forEach((s) => checkSession(s, problems));
  if (!producer) problems.push("studio/producer.md: missing");
  else field(producer, "autonomy", problems, { required: true, oneOf: AUTONOMY });
  if (!direction) problems.push("studio/direction.md: missing");
  else field(direction, "milestone", problems, { required: true });

  // Between files: every name points at something, and statuses agree with each other.
  const unitBySlug = new Map(units.map((u) => [u.slug, u]));
  const askBySlug = new Map(asks.map((a) => [a.slug, a]));
  const milestoneBySlug = new Map(milestones.map((m) => [m.slug, m]));
  for (const slug of units.map((u) => u.slug).filter((s) => askBySlug.has(s))) problems.push(`studio/: "${slug}" is both a unit and an ask`);
  for (const u of units) {
    const ms = u.fields.milestone;
    if (ms !== undefined && !milestoneBySlug.has(String(ms))) problems.push(`${u.path}: milestone "${ms}" has no file in studio/milestones/`);
    for (const need of list(u.fields.needs)) {
      if (!unitBySlug.has(need) && !askBySlug.has(need)) problems.push(`${u.path}: needs "${need}", which is no unit or ask`);
      else if (u.fields.status === "ready" && !isClosed(unitBySlug.get(need) ?? askBySlug.get(need)!)) problems.push(`${u.path}: ready, but "${need}" is still open`);
    }
  }
  for (const a of asks) {
    for (const b of list(a.fields.blocks)) {
      const u = unitBySlug.get(b);
      if (!u) problems.push(`${a.path}: blocks "${b}", which is no unit`);
      else if (!list(u.fields.needs).includes(a.slug)) problems.push(`${a.path}: blocks "${b}", but ${u.path} doesn't list it in needs`);
    }
  }
  for (const s of sessions) for (const u of list(s.fields.units)) if (!unitBySlug.has(u)) problems.push(`${s.path}: unit "${u}" has no file in studio/work/`);
  const current = milestones.filter((m) => m.fields.status === "current");
  if (current.length > 1) problems.push(`studio/milestones/: ${current.length} milestones are current (${current.map((m) => m.slug).join(", ")}); one at a time`);
  if (direction?.fields.milestone !== undefined) {
    const m = milestoneBySlug.get(String(direction.fields.milestone));
    if (!m) problems.push(`studio/direction.md: milestone "${direction.fields.milestone}" has no file in studio/milestones/`);
    else if (m.fields.status !== "current") problems.push(`studio/direction.md: milestone "${m.slug}" is ${m.fields.status}, not current`);
  }
  return { units, asks, milestones, sessions, producer, direction, problems };
}

/** A unit that's landed (done, or merged and waiting for a playtest) or dropped; an ask that's answered or expired. */
export function isClosed(doc: Doc): boolean {
  return ["done", "playtest", "dropped", "answered", "expired"].includes(String(doc.fields.status));
}

/** Units a session has in hand: only seen while one runs (or on its branch). */
export const inFlight = (studio: Studio): Doc[] => studio.units.filter((u) => u.fields.status === "doing" || u.fields.status === "review");

export interface GitHub {
  prs: { number: number; title: string; draft: boolean; labels: string[] }[];
  issues: { number: number; title: string; labels: string[] }[];
}

/** Open PRs and issues, asked of GitHub with `gh api`; undefined when it can't be asked. */
export function fromGitHub(root: string): GitHub | undefined {
  const url = spawnSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).stdout ?? "";
  const repo = url.trim().match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
  if (!repo) return undefined;
  const api = (path: string): any[] | undefined => {
    const r = spawnSync("gh", ["api", `repos/${repo}/${path}`], { cwd: root, encoding: "utf8" });
    return r.status === 0 ? JSON.parse(r.stdout) : undefined;
  };
  const prs = api("pulls?state=open&per_page=100");
  const issues = api("issues?state=open&per_page=100");
  if (!prs || !issues) return undefined;
  const labels = (x: any): string[] => x.labels.map((l: any) => l.name);
  return {
    prs: prs.map((p) => ({ number: p.number, title: p.title, draft: p.draft, labels: labels(p) })),
    issues: issues.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, labels: labels(i) })),
  };
}

const title = (d: Doc) => String(d.fields.title ?? d.slug);
const unitLine = (u: Doc) => {
  const bits = [u.fields.kind, u.fields.size, u.fields.role].filter(Boolean).join(", ");
  const needs = list(u.fields.needs);
  return `- **${u.slug}**: ${title(u)} (${bits})${u.fields.pr ? ` #${u.fields.pr}` : ""}${needs.length ? `; needs ${needs.join(", ")}` : ""}`;
};

/** The board as Markdown: what needs the producer, what's in flight, what's next, what's done. */
export function board(studio: Studio, github?: GitHub): string {
  const { units, asks, milestones } = studio;
  const by = (status: string) => units.filter((u) => u.fields.status === status);
  const out: string[] = ["# The board", "", "Generated from `studio/` by `pnpm board`. Formats: [the studio's state](README.md#the-studios-state).", ""];

  const autonomy = studio.producer?.fields.autonomy;
  const current = milestones.find((m) => m.fields.status === "current");
  out.push(`**Autonomy:** ${autonomy ?? "not set"}. **Milestone:** ${current ? `${current.slug}, ${title(current)}` : "none current"}.`, "");

  out.push("## Milestones", "");
  for (const m of milestones) {
    const mine = units.filter((u) => u.fields.milestone === m.slug && u.fields.status !== "dropped");
    const done = mine.filter((u) => u.fields.status === "done").length;
    out.push(`- **${m.slug}** (${m.fields.status}): ${title(m)}. ${done}/${mine.length} units done.`);
  }
  if (!milestones.length) out.push("- none");

  out.push("", "## Needs you", "");
  const open = asks.filter((a) => a.fields.status === "open").sort((a, b) => Number(b.fields.gated) - Number(a.fields.gated));
  const needs = [
    ...open.map((a) => `- Ask **${a.slug}**${a.fields.gated ? " (gated)" : ""}: ${title(a)} Default: ${String(a.fields.default).replace(/\.$/, "")}. Blocks ${list(a.fields.blocks).join(", ")}.${a.fields.gated ? "" : ` Expires ${a.fields.expires}.`}`),
    ...(github?.prs.filter((p) => p.labels.includes("gated")).map((p) => `- Gated PR #${p.number}: ${p.title}`) ?? []),
    ...by("playtest").map((u) => `- Playtest **${u.slug}**: ${title(u)}${u.fields.scenario ? ` (scenario ${u.fields.scenario})` : ""}`),
  ];
  out.push(...(needs.length ? needs : ["- nothing"]));

  out.push("", "## In flight", "");
  const flying = inFlight(studio);
  out.push(...(flying.length ? flying.map((u) => `${unitLine(u)} [${u.fields.status}]`) : ["- nothing"]));

  if (github) {
    out.push("", "## Bugs", "");
    const bugs = github.issues.sort((a, b) => Number(b.labels.includes("blocker")) - Number(a.labels.includes("blocker")));
    out.push(...(bugs.length ? bugs.map((i) => `- #${i.number}: ${i.title}${i.labels.length ? ` (${i.labels.join(", ")})` : ""}`) : ["- none open"]));
    out.push("", "## Open PRs", "");
    out.push(...(github.prs.length ? github.prs.map((p) => `- #${p.number}: ${p.title}${p.draft ? " (draft)" : ""}`) : ["- none"]));
  }

  // The current milestone's first, then the bigger units, which usually hold the bigger unknowns.
  const order = (u: Doc) => (u.fields.milestone === current?.slug ? 0 : 10) - SIZES.indexOf(String(u.fields.size));
  for (const [heading, status] of [["Ready", "ready"], ["Shaped", "shaped"], ["Ideas", "idea"]]) {
    const group = by(status).sort((a, b) => order(a) - order(b));
    if (group.length || status === "ready") out.push("", `## ${heading}`, "", ...(group.length ? group.map(unitLine) : ["- nothing ready: time to shape"]));
  }
  for (const [heading, status] of [["Done", "done"], ["Dropped", "dropped"]]) {
    const group = by(status);
    if (group.length) out.push("", `## ${heading}`, "", ...group.map(unitLine));
  }
  if (studio.problems.length) out.push("", "## Problems", "", ...studio.problems.map((p) => `- ${p}`));
  return out.join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const studio = loadStudio(root);
  const github = process.argv.includes("--github") ? fromGitHub(root) : undefined;
  if (process.argv.includes("--github") && !github) console.error("(couldn't ask GitHub: board without PRs and issues)");
  console.log(process.argv.includes("--json") ? JSON.stringify({ ...studio, github }, null, 2) : board(studio, github));
  process.exitCode = studio.problems.length ? 1 : 0;
}
