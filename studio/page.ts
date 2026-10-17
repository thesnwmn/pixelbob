// The studio page on Pages (…/pixelbob/studio/): the board, and a timeline of the
// sessions, as one HTML file. Generated from the files like the board, never committed.
// scripts/build-site.mjs writes it; `node studio/page.ts <out.html> [--github]` writes it alone.
// See studio/README.md#transparency.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type GitHub, type Studio, board, fromGitHub, loadStudio } from "./board.ts";

/** Where a link relative to studio/ goes once the page isn't next to the files. */
export const BLOB = "https://github.com/thesnwmn/pixelbob/blob/main/studio/";

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One line of the board's Markdown as HTML: `code`, **bold**, [links](…). */
export function inline(md: string): string {
  const parts = md.split(/(`[^`]*`)/);
  return parts
    .map((part, i) => {
      if (i % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${/^[a-z]+:/i.test(href) ? href : BLOB + href}">${text}</a>`);
    })
    .join("");
}

/** The board's Markdown (headings, paragraphs, lists) as HTML. */
export function markdown(md: string): string {
  const out: string[] = [];
  let list = false;
  for (const line of md.split("\n")) {
    const item = line.match(/^- (.*)$/);
    if (list && !item) out.push("</ul>");
    if (item && !list) out.push("<ul>");
    list = !!item;
    const heading = line.match(/^(#{1,3}) (.*)$/);
    if (item) out.push(`<li>${inline(item[1])}</li>`);
    else if (heading) out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}

/** The sessions, newest first: date, what it did (its summary's first sentence), its PR. */
export function timeline(studio: Studio): string {
  const sessions = [...studio.sessions].sort((a, b) => String(b.fields.date).localeCompare(String(a.fields.date)) || b.slug.localeCompare(a.slug));
  const lines = sessions.map((s) => {
    const summary = (s.sections.Summary ?? "").split(/(?<=\.)\s/)[0];
    const prs = String(s.fields.pr ?? "").match(/\d+/g) ?? [];
    const pr = prs.map((n) => ` [#${n}](https://github.com/thesnwmn/pixelbob/pull/${n})`).join("");
    return `- **${s.fields.date}** [${s.slug}](sessions/${s.slug}.md)${pr}: ${summary}`;
  });
  return markdown(["## Sessions", "", ...(lines.length ? lines : ["- none yet"])].join("\n"));
}

export function page(studio: Studio, github?: GitHub, now = new Date()): string {
  const body = markdown(board(studio, github).replace("Generated from `studio/` by `pnpm board`.", `Generated from \`studio/\` on ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pixelbob studio</title>
    <style>
      body { font: 16px/1.5 ui-monospace, Menlo, Consolas, monospace; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; color: #e9e2d6; background: #121014; }
      h1 { color: #e7c27a; }
      h2 { color: #e9e2d6; font-size: 1.1rem; margin-top: 1.6rem; }
      a { color: #e7c27a; }
      p, li { color: #b8ae9f; }
      b { color: #e9e2d6; }
      code { color: #e9e2d6; }
    </style>
  </head>
  <body>
    <p><a href="../">Pixelbob</a> · ${github ? "with open PRs and bugs from GitHub" : "without GitHub (PRs and bugs not shown)"}</p>
${body}
${timeline(studio)}
  </body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const out = process.argv[2];
  if (!out) throw new Error("usage: node studio/page.ts <out.html> [--github]");
  writeFileSync(out, page(loadStudio(root), process.argv.includes("--github") ? fromGitHub(root) : undefined));
}
