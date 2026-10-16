# Pixelbob

A 2D side-on platformer for the browser (phones and laptops) where everything is made of simulated pixels, including the hero: **Bob**, a squishy blob who squeezes through gaps, splits apart and pulls himself back together. Heat makes him runny; cold makes him brittle.

- Design notes: [`docs/`](docs/README.md)
- Prototypes: <https://thesnwmn.github.io/pixelbob/> (each PR gets a preview at `…/preview/pr-N/`)

## Develop

```
pnpm install
pnpm dev:stills     # art direction stills, http://localhost:5180
pnpm typecheck && pnpm test
pnpm build:site     # static site in _site/, as deployed to GitHub Pages
```
