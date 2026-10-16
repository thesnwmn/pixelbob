# 04 Tech and toolchain

## Stack

| Concern | Pick | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Same language for sim, renderer, editor and tools. Typed arrays are fast enough to start with |
| Build / dev server | **Vite** | Instant reloads, workers, WASM, static output |
| Monorepo | **pnpm workspace** (`packages/*`, `prototypes/*`) | Shared sim and render code, one prototype per experiment; same layout as familiar-ground |
| Rendering | **WebGL2** (raw, or a thin helper like twgl) | Available on every target browser, including iOS Safari. Cell grid → texture each frame; lighting in shaders |
| Tests | **Vitest** for the sim (headless, deterministic); **Playwright** screenshots for rendering | The sim must run in Node without a DOM |
| Hosting | **GitHub Pages**, with a preview per PR | Free and static; the workflows are copied from familiar-ground |
| Audio (later) | Web Audio, procedural where possible | Sizzles, splats and drips driven by sim events |

Not now: game engines (Phaser, Pixi, Godot web). The sim *is* the engine, and we'd fight their scene graphs and physics. WebGPU only once Safari support is solid enough for phones; the renderer should keep WebGL2 as a baseline.

## Packages (planned)

```
packages/
  sim/        grid CA, materials, temperature, reactions (built); particles/XPBD and Bob controller (phase 2). No DOM.
  render/     WebGL2 renderer: lives in prototypes/01-sandbox/src/gl.ts for now; moves here when Bob's playground needs it too.
  levels/     level format, loading/saving, generation helpers.
prototypes/
  00-stills/      art direction stills (CPU renderer, this PR)
  01-sandbox/     world sandbox: dig, paint materials, heat, light
  02-bob/         Bob playground
```

`prototypes/00-stills/src/kit/` is the reference implementation of the look. The lighting there is deliberately structured like a GPU pipeline (half-res light grid, nearest-surface lookup, two-scale bloom) so it ports to shaders directly.

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

- `ci.yml`: install, typecheck, test, build site on every push to main and every PR.
- `deploy-pages.yml`: on push to main, build `_site/` and push it to the `gh-pages` branch (keeping `preview/pr-*/`).
- `pr-preview.yml`: on each PR push, build and publish to `gh-pages:/preview/pr-N/`, and comment the URL on the PR.
- `pr-cleanup.yml`: delete the preview folder when the PR closes.
- `scripts/build-site.mjs`: collects every `prototypes/*/dist` into `_site/` with an index page.

The site is served at `https://thesnwmn.github.io/pixelbob/`, and PR previews at `…/pixelbob/preview/pr-N/`.

**Bootstrapping:** workflows only run from the default branch once it exists. So the first PR, which adds the workflows, has to be merged before previews work, and Pages must be set to "Deploy from a branch: `gh-pages` / root" after the first deploy creates that branch.

## Testing

- **Sim unit tests** (Vitest): sand piles at the right angle, water levels out, oil floats, lava + water → stone + steam, heat spreads, Bob conserves particles, bonds break at the set strain. Deterministic seeds make them exact.
- **Golden images** (Playwright): render fixed scenes at fixed times and compare. `prototypes/00-stills/scripts/render.ts` already renders stills headlessly in Node, which is enough for cheap image diffs.
- **Perf checks**: a benchmark scene in CI that fails if a step gets much slower.

## Level format

- **Material layer as an indexed PNG** (one palette index per material), plus optional temperature and back-wall layers. Editable in our sandbox *and* in Aseprite or any paint tool.
- **Entities as JSON**: spawn points, lights, machines, triggers, with positions in world pixels.
- Big levels are cut into chunks on load; the sandbox saves the same format.
- Procedural decoration (grass, moss, vines, stalactites) is generated from the material layer with a seed, as in the stills, so artists paint big shapes and the game adds detail.

## Input

Pointer Events for mouse and touch together; the Gamepad API; keyboard. Touch layout is in [01](01-game-overview.md). The sandbox needs pinch-zoom and two-finger pan on phones.

## Commands (today)

```
pnpm install
pnpm dev:stills       # art stills at http://localhost:5180
pnpm dev:sandbox      # world sandbox at http://localhost:5181
pnpm typecheck
pnpm test
pnpm build:site       # _site/ as deployed to Pages
node prototypes/00-stills/scripts/render.ts out 2   # stills to PNG without a browser
```
