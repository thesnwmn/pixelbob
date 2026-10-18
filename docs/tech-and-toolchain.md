# Tech and toolchain

## Stack

| Concern | Pick | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Same language for sim, renderer, editor and tools. Typed arrays are fast enough to start with |
| Build / dev server | **Vite** | Instant reloads, workers, WASM, static output |
| Monorepo | **pnpm workspace** (`packages/*`, `prototypes/*`) | Shared sim and render code, one prototype per experiment; same layout as familiar-ground |
| Rendering | **WebGL2** (raw, or a thin helper like twgl) | Available on every target browser, including iOS Safari. Cell grid → texture each frame; lighting in shaders |
| Tests | **Vitest** for the sim (headless, deterministic); **Playwright** screenshots for rendering (not yet added) | The sim must run in Node without a DOM |
| Hosting | **GitHub Pages**, with a preview per PR | Free and static; the workflows are copied from familiar-ground |
| Audio (later) | Web Audio, procedural where possible | Sizzles, splats and drips driven by sim events |

Not now: game engines (Phaser, Pixi, Godot web). The sim *is* the engine, and we'd fight their scene graphs and physics. WebGPU only once Safari support is solid enough for phones; the renderer should keep WebGL2 as a baseline.

## Packages

```
packages/
  sim/        grid CA, materials, temperature, reactions. No DOM.
  bob/        Bob: goo (a viscoelastic particle fluid), his body (collisions, heat, controller, pieces), the test course, his painter. No DOM.
  render/     WebGL2 renderer and the CPU pass that turns cells into its textures (shared by the sandbox and the playground).
  play/       (planned) bots, if they outgrow game/ (recording, replaying and the headless runner are in game/src). No DOM.
  levels/     (planned) level format, loading/saving, generation helpers.
game/         the game: a level, Bob, the handoff card and the feedback button (see below)
prototypes/
  00-stills/      art direction: one shot per world and Bob's states (CPU renderer, real goo Bob)
  01-sandbox/     world sandbox: dig, paint materials, heat, light
  02-bob/         Bob playground
  03-bot-search/  spike: a beam search over inputs finds a route through a level (verdict: yes, in about 3 minutes)
concept/          the concept doc, not a prototype: the game, look, worlds, menus, settings, plan (shots drawn live)
```

`prototypes/00-stills/src/kit/` is the reference implementation of the look (with Bob's painter, shared from `packages/bob/src/draw.ts`). The lighting there is deliberately structured like a GPU pipeline (half-res light grid, nearest-surface lookup, two-scale bloom) so it ports to shaders directly.

## Rendering pipeline (WebGL2)

1. Upload the cell colour/material buffer for the visible area (320×180×4 bytes ≈ 230 KB) as a texture. Only changed chunks if needed.
2. Occlusion texture from material occlusion → half-res light pass: one draw per light or a combined pass with shadow ray-marching; later maybe radiance cascades for many lights.
3. Composite: albedo × light (back wall dimmed, solids by depth via a precomputed distance texture) + emission.
4. Bloom: downsample chain + blur, add.
5. Grade, then integer upscale to the canvas with `NEAREST` filtering.

## Threads and the SharedArrayBuffer problem

- Phase 1 runs **everything on the main thread**. At 320×180 with sleeping chunks the grid step should be a few ms.
- If we need a worker: the grid lives in the worker and hands back a colour buffer (a transferable `ArrayBuffer`, ping-ponged) each frame.
- **SharedArrayBuffer needs cross-origin isolation** (`COOP`/`COEP` headers), and **GitHub Pages can't set headers**. Options if we need it: the `coi-serviceworker` shim (works on Pages, but needs a reload on first visit), or move hosting to Cloudflare Pages / Netlify, which allow headers. Avoid needing it as long as possible.
- **WASM** (Rust or Zig) only for the grid step and constraint solver, and only after profiling. Keep `packages/sim` data-oriented (typed arrays, no objects per cell) so the port is mechanical.

## Hosting and previews

Copied from familiar-ground:

- `ci.yml`: `pnpm health` (install, typecheck, test, build site, and the repo's conventions) on every push to main, every PR and nightly on main; a red nightly opens an issue. See [the health check](../studio/README.md#health).
- `pr-title.yml`: checks the PR title is `type(scope)!: Summary` (see [the studio's PRs](../studio/README.md#prs)), since it becomes the squash commit.
- `deploy-pages.yml`: on push to main, and when a PR or issue opens or closes (for the studio page's PRs and bugs), build `_site/` and push it to the `gh-pages` branch (keeping `preview/pr-*/`).
- `pr-preview.yml`: on each PR push, build and publish to `gh-pages:/preview/pr-N/`, and comment the URL on the PR.
- `pr-cleanup.yml`: delete the preview folder when the PR closes.
- `scripts/build-site.mjs`: collects the concept doc, the game (with a link to each scenario on the index) and every `prototypes/*/dist` into `_site/` with an index page, and writes the [studio page](../studio/README.md#transparency) to `_site/studio/`.

The site is served at `https://thesnwmn.github.io/pixelbob/`, and PR previews at `…/pixelbob/preview/pr-N/`.

**Bootstrapping:** workflows only run from the default branch once it exists. So the first PR, which adds the workflows, has to be merged before previews work, and Pages must be set to "Deploy from a branch: `gh-pages` / root" after the first deploy creates that branch.

## Testing

- **Sim unit tests** (Vitest): sand piles at the right angle, water levels out, oil floats, lava + water → stone + steam, heat spreads. Bob has behaviour tests too: he conserves particles, settles still, picks up a bit without a jolt, dangles and drips, keeps steering the piece you had, climbs tacky walls only when you push in, and runs the course. Deterministic seeds make them exact.
- **Golden images** (planned, Playwright): render fixed scenes at fixed times and compare. `prototypes/00-stills/scripts/render.ts` already renders stills headlessly in Node, which is enough for cheap image diffs.
- **Perf checks** (planned): a benchmark scene in CI that fails if a step gets much slower.

## The game

`game/` is the game itself, apart from the prototypes: a Vite app built to `…/pixelbob/game/` (and `…/preview/pr-N/game/` in a PR's preview). Nothing in it imports from `prototypes/`.

- `src/scenario.ts`: the [scenario](../studio/README.md#scenarios-putting-you-where-the-change-is) format, one JSON file per scenario in `game/scenarios/`, named by its id. A scenario names a level and its seed, where Bob starts (`at`, in cells across; he's put on the ground there), his temperature and tweaks, the camera's zoom and look, and the handoff card (`changed`, `try`, `lookFor`, `known`, `questions`). `?scenario=<id>` starts there; without one the game starts at `start`. The health check (`code/scenarios`) checks every file.
- `src/levels.ts`: the levels a scenario can name. For now only `course`, Bob's test course; the level format adds the Green's.
- `src/play.ts`: a scenario being played (the world and Bob, stepped at 60 Hz), recording its input. No DOM, so the tests run every scenario in Node, and so do replays (`runReplay`) and, later, bots.
- `src/replay.ts`: the replay format. Each frame's input is rounded to eighths before Bob sees it, so what's recorded is exactly what ran, then run-length encoded as text: `pixelbob-replay v1 <scenario> <frames>: 8*120 8j*8 0d8*30 …` (move, `j` jump, `d` down, `u` up, each in eighths, `*` a count). A replay is of the run since the start or the last restart, and is exact on the JavaScript engine it was recorded on: V8 (Chrome, Android, Node) gives the same run, but Bob's maths (`sin`, `exp`, `pow`) isn't required to round the same everywhere, so a replay from Safari or an iPhone may drift. The report names the browser. Kept replays are `game/replays/<id>.json`, named for what they cover (the day it was `recorded`, a `note` saying why it's kept, the `replay`, and the outcome it should `expect`: frames, the frame it finished, % of Bob home, % of Bob left, and a fingerprint of Bob's particles and the world's cells, so any change to the run shows). The health check (`code/replays`, a slow check) plays them all with `node game/scripts/replays.ts`, which also keeps a new one (`--add <id> <file> <note>`, from a pasted feedback report) and rewrites the outcomes when a change means to alter them (`--update`).
- `src/filmstrip.ts`: key frames of a run side by side, cropped around Bob, from the game's cell colours and Bob's painter but unlit. `node game/scripts/filmstrip.ts <replay id or file> <out.png> [shots] [scale]` writes one.
- `src/report.ts`: the feedback report. The Feedback button (or F) asks for fun, difficulty, frustration, notes and the card's questions, and copies a report with the build, commit, scenario and the replay, to paste into `/playtest`.
- `src/main.ts`: the browser side: the card, the form, keyboard and touch input, the camera and the renderer.

## Level format

- **Material layer as an indexed PNG** (one palette index per material), plus optional temperature and back-wall layers. Editable in our sandbox *and* in Aseprite or any paint tool.
- **Entities as JSON**: spawn points, lights, machines, triggers, with positions in world pixels.
- Big levels are cut into chunks on load; the sandbox saves the same format.
- Procedural decoration (grass, moss, vines, stalactites) is generated from the material layer with a seed, as in the stills, so artists paint big shapes and the game adds detail.

## Input

Pointer Events for mouse and touch together; the Gamepad API; keyboard. Touch layout is in [Game overview](game-overview.md). The sandbox needs pinch-zoom and two-finger pan on phones.

## Commands (today)

```
pnpm install
pnpm dev:stills       # art stills at http://localhost:5180
pnpm dev:sandbox      # world sandbox at http://localhost:5181
pnpm dev:bob          # Bob playground at http://localhost:5182
pnpm dev:concept      # concept doc at http://localhost:5183
pnpm dev:game         # the game at http://localhost:5184 (?scenario=<id>)
pnpm health           # the health check (--quick skips the build, --end at the end of a session)
pnpm board            # the studio's board (--github adds open PRs and bugs)
pnpm typecheck
pnpm test
pnpm build:site       # _site/ as deployed to Pages
node prototypes/00-stills/scripts/render.ts out 3   # shots to PNG without a browser
```
