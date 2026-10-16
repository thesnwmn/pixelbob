// Assembles every built prototype into one static site for GitHub Pages:
//   _site/index.html          list of prototypes
//   _site/<prototype>/...     each prototype's dist/
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
      a { color: #e7c27a; }
      p, li { color: #b8ae9f; }
    </style>
  </head>
  <body>
    <h1>Pixelbob</h1>
    <p>Prototypes for a 2D platformer where everything, including Bob the blob, is simulated pixels.</p>
    <ul>
      ${items || "<li>No prototypes built yet.</li>"}
    </ul>
    <p><a href="https://github.com/thesnwmn/pixelbob/tree/main/docs">Design notes</a></p>
  </body>
</html>
`,
);
console.log(`Built _site with ${entries.length} prototype(s): ${entries.map((e) => e.name).join(", ")}`);
