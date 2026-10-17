// Tier 5, the studio and the docs: every file in studio/ follows its format and agrees
// with the others (the board reads them the same way), nothing is left in flight, the
// docs index lists every doc, and every link between the docs resolves.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { inFlight, loadStudio, parseFrontMatter, ROLES } from "../../../studio/board.ts";
import { type Check, fail, inCI, pass } from "./check.ts";
import { page } from "../../../studio/page.ts";
import { DOC_MAP, type DocMapEntry, globRe, IN_STEP, readDocMap } from "./instep.ts";

export const files: Check = {
  id: "studio/files",
  tier: 5,
  repro: "pnpm board",
  hint: "A studio file doesn't follow its format, or names a unit, ask or milestone that doesn't exist. The formats are in studio/README.md#the-studios-state.",
  run({ root }) {
    const studio = loadStudio(root);
    if (studio.problems.length) return fail(`${studio.problems.length} problem${studio.problems.length === 1 ? "" : "s"}`, studio.problems.join("\n"));
    return pass(`${studio.units.length} units, ${studio.asks.length} asks, ${studio.milestones.length} milestones, ${studio.sessions.length} sessions`);
  },
};

export const flying: Check = {
  id: "studio/in-flight",
  tier: 5,
  repro: "pnpm board",
  hint: "A unit is doing or review only while a session runs, so never on main. The session that had it moves it on: done, playtest, ready with a handoff, or dropped.",
  run({ root, sh, env }) {
    const units = inFlight(loadStudio(root));
    const list = units.map((u) => `${u.slug} (${u.fields.status})`).join(", ");
    const onMain = sh("git", ["branch", "--show-current"]).out.trim() === "main" || (inCI(env) && env.GITHUB_REF === "refs/heads/main");
    if (onMain && units.length) return fail(`on main: ${list}`);
    return pass(units.length ? list : "none");
  },
};

export const landed: Check = {
  id: "studio/landed",
  tier: 5,
  end: true,
  repro: "pnpm board",
  hint: "The session's unit is still doing: set it to done, playtest, ready (with a handoff in its log) or dropped before the PR merges. A gated PR's unit waits at review.",
  run({ root }) {
    const doing = loadStudio(root).units.filter((u) => u.fields.status === "doing");
    return doing.length ? fail(`still doing: ${doing.map((u) => u.slug).join(", ")}`) : pass();
  },
};

/** `name` and `description` in each file's front matter, the name matching `nameOf(file)`. */
function briefProblems(root: string, files: string[], nameOf: (file: string) => string): string[] {
  const problems: string[] = [];
  for (const file of files) {
    try {
      const fm = parseFrontMatter(readFileSync(join(root, file), "utf8"));
      if (!fm) problems.push(`${file}: no front matter`);
      else {
        if (fm.fields.name !== nameOf(file)) problems.push(`${file}: name should be "${nameOf(file)}"`);
        if (!fm.fields.description) problems.push(`${file}: no description`);
      }
    } catch (e) {
      problems.push(`${file}: ${(e as Error).message}`);
    }
  }
  return problems;
}

const listDir = (root: string, dir: string) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).sort() : []);

/** The roles in the table under `## The roles` in studio/README.md, as slugs ("Art director" → art-director). */
export function tableRoles(readme: string): string[] {
  const section = readme.split(/^## The roles$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...section.matchAll(/^\| \*\*([^*]+)\*\* \|/gm)].map((m) => m[1].toLowerCase().replace(/\s+/g, "-"));
}

export const roles: Check = {
  id: "studio/roles",
  tier: 5,
  repro: "ls .claude/agents",
  hint: "Every role has a brief in .claude/agents/<role>.md, a row in the roles table (studio/README.md#the-roles), and a place in ROLES in studio/board.ts; the three agree. A role is added or retired by a decision record.",
  run({ root }) {
    const readme = join(root, "studio/README.md");
    if (!existsSync(readme)) return fail("no studio/README.md");
    const table = tableRoles(readFileSync(readme, "utf8"));
    const briefs = listDir(root, ".claude/agents").filter((n) => n.endsWith(".md"));
    const named = briefs.map((n) => n.replace(/\.md$/, ""));
    const problems = [
      ...table.filter((r) => !named.includes(r)).map((r) => `${r}: in the roles table, but no .claude/agents/${r}.md`),
      ...named.filter((r) => !table.includes(r)).map((r) => `${r}: has a brief, but isn't in the roles table`),
      ...table.filter((r) => !ROLES.includes(r)).map((r) => `${r}: not in ROLES in studio/board.ts`),
      ...ROLES.filter((r) => !table.includes(r)).map((r) => `${r}: in ROLES in studio/board.ts, but not in the roles table`),
      ...briefProblems(root, briefs.map((n) => `.claude/agents/${n}`), (f) => f.split("/").pop()!.replace(/\.md$/, "")),
    ];
    return problems.length ? fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}`, problems.join("\n")) : pass(`${table.length} roles`);
  },
};

/** The commands the producer guide documents, from its "### `/go`" headings. */
export const guideCommands = (guide: string): string[] => [...guide.matchAll(/^### `\/([\w-]+)/gm)].map((m) => m[1]);

export const commands: Check = {
  id: "studio/commands",
  tier: 5,
  repro: "ls .claude/skills",
  hint: "Every command is a skill in .claude/skills/<name>/SKILL.md and has a section in studio/producer-guide.md#the-commands; the two agree.",
  run({ root }) {
    const guidePath = join(root, "studio/producer-guide.md");
    if (!existsSync(guidePath)) return fail("no studio/producer-guide.md");
    const guide = guideCommands(readFileSync(guidePath, "utf8"));
    const skills = listDir(root, ".claude/skills").filter((n) => existsSync(join(root, ".claude/skills", n, "SKILL.md")));
    const problems = [
      ...guide.filter((c) => !skills.includes(c)).map((c) => `/${c}: in the producer guide, but no .claude/skills/${c}/SKILL.md`),
      ...skills.filter((c) => !guide.includes(c)).map((c) => `/${c}: a skill, but not in the producer guide`),
      ...briefProblems(root, skills.map((n) => `.claude/skills/${n}/SKILL.md`), (f) => f.split("/")[2]),
    ];
    return problems.length ? fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}`, problems.join("\n")) : pass(`${skills.length} commands`);
  },
};

export const docsIndex: Check = {
  id: "docs/index",
  tier: 5,
  repro: "ls docs docs/decisions",
  hint: "Every doc and decision record is listed in docs/README.md, so a reader (or a session) can find it: add a row or a link.",
  run({ root, sh }) {
    const readme = join(root, "docs/README.md");
    if (!existsSync(readme)) return fail("no docs/README.md");
    const index = readFileSync(readme, "utf8");
    const docs = sh("git", ["ls-files", "-co", "--exclude-standard", "docs/*.md", "docs/decisions/*.md"]).out.trim().split("\n").filter(Boolean);
    const listed = docs.filter((d) => d !== "docs/README.md");
    const missing = listed.filter((d) => !index.includes(`(${d.slice("docs/".length)})`));
    return missing.length ? fail(`not in docs/README.md: ${missing.join(", ")}`) : pass(`${listed.length} docs`);
  },
};

/** The anchor GitHub gives a heading: lowercase, punctuation dropped, spaces to hyphens. */
export const slugify = (heading: string): string =>
  heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

/** Every anchor in a Markdown file, with GitHub's -1, -2 for repeated headings. */
export function anchors(md: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const m of stripFences(md).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

/** Fenced blocks blanked: headings and links in them aren't real. */
const stripFences = (md: string): string => md.replace(/^(```|~~~)[\s\S]*?^\1/gm, (c) => c.replace(/[^\n]/g, " "));
/** Inline code blanked too, for links (a heading's inline code is part of its anchor). */
const stripCode = (md: string): string => stripFences(md).replace(/`[^`\n]*`/g, "``");

/** `file: link (why)` for every relative link in `files` that doesn't resolve, anchors included. */
export function brokenLinks(root: string, files: string[]): string[] {
  const broken: string[] = [];
  const cache = new Map<string, Set<string>>();
  const anchorsOf = (path: string) => {
    if (!cache.has(path)) cache.set(path, anchors(readFileSync(join(root, path), "utf8")));
    return cache.get(path)!;
  };
  for (const file of files) {
    const md = stripCode(readFileSync(join(root, file), "utf8"));
    for (const m of md.matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const link = m[1];
      if (/^[a-z]+:/i.test(link)) continue;
      const [path, anchor] = link.split("#");
      const target = path ? normalize(join(dirname(file), decodeURIComponent(path))) : file;
      if (!existsSync(join(root, target))) broken.push(`${file}: ${link} (no such file)`);
      else if (anchor && target.endsWith(".md") && !anchorsOf(target).has(anchor.toLowerCase())) broken.push(`${file}: ${link} (no such heading)`);
    }
  }
  return broken;
}

export const links: Check = {
  id: "docs/links",
  tier: 5,
  repro: "pnpm health (docs/links lists each broken link)",
  hint: "A link points at a file or heading that has moved or been renamed: fix the link, or the heading it meant.",
  run({ root, sh }) {
    const md = sh("git", ["ls-files", "-co", "--exclude-standard", "*.md"]).out.trim().split("\n").filter((f) => f && existsSync(join(root, f)));
    const broken = brokenLinks(root, md);
    return broken.length ? fail(`${broken.length} broken`, broken.join("\n")) : pass(`${md.length} files`);
  },
};

/** What's wrong with the doc map: a glob that matches no file, a doc or heading that doesn't exist. */
export function docMapProblems(root: string, map: DocMapEntry[], files: string[]): string[] {
  const problems: string[] = [];
  for (const entry of map) {
    const ok = (x: unknown) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string");
    if (!entry || !ok(entry.paths) || !ok(entry.docs)) {
      problems.push(`an entry that isn't { paths: [...], docs: [...] }: ${JSON.stringify(entry)}`);
      continue;
    }
    const { paths, docs } = entry;
    for (const glob of paths) if (!files.some((f) => globRe(glob).test(f))) problems.push(`${glob}: matches no file`);
    for (const doc of docs) {
      const [path, anchor] = doc.split("#");
      if (!existsSync(join(root, path))) problems.push(`${doc}: no such ${path.endsWith("/") ? "folder" : "file"}`);
      else if (anchor && !anchors(readFileSync(join(root, path), "utf8")).has(anchor)) problems.push(`${doc}: no such heading`);
    }
  }
  return problems;
}

export const docMap: Check = {
  id: "docs/map",
  tier: 5,
  repro: `cat ${DOC_MAP}`,
  hint: "The doc map (studio/doc-map.json) names a path no file matches, or a doc or heading that has moved: fix the entry, so the docs-in-step check still means something.",
  run({ root, sh }) {
    if (!existsSync(join(root, DOC_MAP))) return fail(`no ${DOC_MAP}`);
    let map: DocMapEntry[];
    try {
      map = readDocMap(root);
      if (!Array.isArray(map)) return fail(`${DOC_MAP} has no "map" list`);
    } catch (e) {
      return fail(`${DOC_MAP}: ${(e as Error).message}`);
    }
    const tracked = sh("git", ["ls-files", "-co", "--exclude-standard"]).out.trim().split("\n").filter(Boolean);
    const problems = docMapProblems(root, map, tracked);
    return problems.length ? fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}`, problems.join("\n")) : pass(`${map.length} entr${map.length === 1 ? "y" : "ies"}`);
  },
};

/** Markdown the studio page didn't turn into HTML (outside <code>), and units it doesn't show. */
export function pageProblems(html: string, slugs: string[]): string[] {
  const text = html.replace(/<code>[\s\S]*?<\/code>/g, "");
  const leftovers = [...text.matchAll(/^.*(\*\*|\]\(|<p>- |<p>#).*$/gm)].map((m) => `left as Markdown: ${m[0].trim()}`);
  const missing = slugs.filter((s) => !html.includes(`<b>${s}</b>`)).map((s) => `${s}: not on the page`);
  return [...leftovers, ...missing];
}

export const studioPage: Check = {
  id: "studio/page",
  tier: 5,
  repro: "node studio/page.ts _site/studio/index.html",
  hint: "The studio page (studio/page.ts) shows the board as HTML: something on the board is Markdown it doesn't convert, or a unit it doesn't show. Teach page.ts the Markdown, or keep the board to what it converts.",
  run({ root }) {
    const studio = loadStudio(root);
    const problems = pageProblems(page(studio), studio.units.map((u) => u.slug));
    return problems.length ? fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}`, problems.join("\n")) : pass(`${studio.units.length} units`);
  },
};

export const STUDIO = [files, flying, landed, roles, commands, docsIndex, links, docMap, studioPage, ...IN_STEP];
