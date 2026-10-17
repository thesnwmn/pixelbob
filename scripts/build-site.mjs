// Assembles the concept doc and every built prototype into one static site for GitHub Pages:
//   _site/index.html          the concept doc's link, then the list of prototypes
//   _site/concept/...         the concept doc's dist/
//   _site/game/...            the game's dist/ (start it somewhere with ?scenario=<id>)
//   _site/studio/index.html   the studio page: the board, from studio/ (STUDIO_GITHUB=1 adds open PRs and bugs)
//   _site/<prototype>/...     each prototype's dist/
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromGitHub, loadStudio } from "../studio/board.ts";
import { page } from "../studio/page.ts";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "_site");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const entries = [];
const prototypesDir = join(root, "prototypes");
const names = existsSync(prototypesDir) ? readdirSync(prototypesDir).sort() : [];
for (const name of names) {
  const dir = join(root, "prototypes", name);
  const dist = join(dir, "dist");
  if (!existsSync(dist) || !existsSync(join(dir, "package.json"))) continue;
  cpSync(dist, join(out, name), { recursive: true });
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  entries.push({ name, description: pkg.description ?? "" });
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// The concept doc isn't a prototype: it's the front door, shown above them.
const concept = existsSync(join(root, "concept", "dist"));
if (concept) cpSync(join(root, "concept", "dist"), join(out, "concept"), { recursive: true });
// The game, likewise: above the prototypes, since it's what they're for.
const game = existsSync(join(root, "game", "dist"));
if (game) cpSync(join(root, "game", "dist"), join(out, "game"), { recursive: true });
// Each scenario is a link into the game: the ones with a handoff card are what a playtest is for.
const scenarioDir = join(root, "game", "scenarios");
const scenarios = game && existsSync(scenarioDir)
  ? readdirSync(scenarioDir).filter((f) => f.endsWith(".json")).sort().map((f) => {
      const s = JSON.parse(readFileSync(join(scenarioDir, f), "utf8"));
      return { id: f.replace(/\.json$/, ""), title: String(s.title ?? ""), card: Boolean(s.card) };
    })
  : [];
const scenarioItems = scenarios
  .map((s) => `<li><a href="./game/?scenario=${esc(s.id)}">${esc(s.id)}</a> - ${esc(s.title)}${s.card ? " (with a handoff card)" : ""}</li>`)
  .join("\n      ");
// The studio page: generated from the files, never committed. Only the deploy asks GitHub.
const github = process.env.STUDIO_GITHUB === "1" ? fromGitHub(root) : undefined;
if (process.env.STUDIO_GITHUB === "1" && !github) console.warn("(couldn't ask GitHub: the studio page is without PRs and bugs)");
mkdirSync(join(out, "studio"));
writeFileSync(join(out, "studio", "index.html"), page(loadStudio(root), github));
const items = entries
  .map((e) => `<li><a href="./${esc(e.name)}/">${esc(e.name)}</a> - ${esc(e.description)}</li>`)
  .join("\n      ");

writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pixelbob prototypes</title>
    <style>
      body { font: 16px/1.5 ui-monospace, Menlo, Consolas, monospace; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; color: #e9e2d6; background: #121014; }
      h1 { color: #e7c27a; }
      h2 { color: #e9e2d6; font-size: 1.1rem; margin-top: 1.6rem; }
      a { color: #e7c27a; }
      p, li { color: #b8ae9f; }
    </style>
  </head>
  <body>
    <h1>Pixelbob</h1>
    <p>A 2D platformer where everything, including Bob the blob, is simulated pixels.</p>
    ${concept ? `<h2>Concept</h2>\n    <p><a href="./concept/"><b>The concept doc</b></a>: what the game is, how it looks, the worlds, menus and the plan.</p>` : ""}
    ${game ? `<h2>Game</h2>\n    <p><a href="./game/"><b>The game</b></a>, from the start. A scenario starts it somewhere, with a card saying what to try:</p>\n    <ul>\n      ${scenarioItems}\n    </ul>` : ""}
    <h2>Studio</h2>
    <p><a href="./studio/"><b>The studio</b></a>: the board (what's in flight, what's waiting on the producer, what's next) and the sessions so far.</p>
    <h2>Prototypes</h2>
    <ul>
      ${items || "<li>No prototypes built yet.</li>"}
    </ul>
    <p><a href="https://github.com/thesnwmn/pixelbob/tree/main/docs">Design notes</a></p>
  </body>
</html>
`,
);
console.log(`Built _site with ${concept ? "the concept doc, " : ""}${game ? "the game, " : ""}the studio page${github ? " (with GitHub)" : ""} and ${entries.length} prototype(s): ${entries.map((e) => e.name).join(", ")}`);
