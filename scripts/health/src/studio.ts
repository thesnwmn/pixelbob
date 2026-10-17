// Tier 5, the studio and the docs: every file in studio/ follows its format and agrees
// with the others (the board reads them the same way), nothing is left in flight, the
// docs index lists every doc, and every link between the docs resolves.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { inFlight, loadStudio } from "../../../studio/board.ts";
import { type Check, fail, inCI, pass } from "./check.ts";

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

export const STUDIO = [files, flying, landed, docsIndex, links];
