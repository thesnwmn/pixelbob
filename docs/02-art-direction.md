# 02 Art direction

The look we're aiming at: the reference shots (physpx) zoomed in further. Crisp pixels, a lit simulated layer over a dim back wall, and colour coming from light and emissive materials rather than from saturated textures.

Everything below can be seen and toggled in `prototypes/00-stills`.

## Camera and pixel scale

- **Default camera: about 320×180 world pixels** (the stills render 480×270 and crop in; the zoom control compares 480, 320 and 240 wide). Bob is about 30 px wide at this camera in the stills (the playground's goo Bob is about 20 px), roughly a tenth of the screen width: close enough to see him deform, far enough to see what's coming.
- **One world pixel = one simulated cell.** No sub-cell art. Detail comes from more cells, not from finer sprites.
- **Integer scaling on device pixels.** Choose the scale that makes the camera closest to 320 wide, then let the camera size flex a little to fill the screen rather than letterboxing or blurring. On a 1920×1080 laptop that's 6×. On a phone in landscape (about 2532×1170 device pixels) it's 7×, giving a 361×167 camera.
- **Camera zoom as a game tool**: pull out in big caverns or when Bob is split, push in for tight squeezes. Only ever by whole-pixel steps.

## Layers

| Layer | Lit? | Simulated? | Notes |
|---|---|---|---|
| Backdrop (sky, distant hills) | No | No | Painted parallax, colour-graded for depth |
| Back wall | Yes, dimmer (×0.5–0.85) | No (diggable later?) | What you see through tunnels; catches light halos |
| Play layer: solids | Lit at the surface, fades to dark inside | Yes | Rock interiors fade to near black, as in the reference |
| Play layer: fluids, plants, Bob | Yes | Yes | Translucent fluids, plants on springs |
| Emission + bloom | Adds light | — | Fire, goo, lamps, crystals, sparks |

## Lighting model

1. Every cell has an **albedo** and optional **emission**, and **blocks light** by a material amount (rock about 0.55 per cell, so light bleeds a couple of pixels into surfaces).
2. **Point lights** (lamps, fire, mushrooms) and **directional lights** (sun, sky) are traced on a half-resolution grid, which gives soft shadows cheaply.
3. **Solids take their light from their nearest surface** and fade with depth to a dim ambient. This is what gives the bright rims and dark interiors.
4. **Bloom** from emission and from anything over a brightness threshold, at two scales.
5. **Grade**: soft highlight roll-off, per-biome tint, vignette, and a very light ordered dither so gradients stay pixel-y.

Things we decided while making the stills:

- **Emitters never shadow themselves.** A mushroom's light sits under its cap, and the first light cells are skipped.
- **Bob has a little self-illumination.** Under strong coloured light (teal caves, orange foundry) his albedo alone goes grey or blows out. A small floor of his own colour keeps him readable; hot Bob gets more because he glows.
- **Editor work light.** The sandbox uses near-flat lighting so you can see what you're building, with a toggle to preview real lighting.

## Palette

Material ramps live in `prototypes/00-stills/src/kit/materials.ts`: 3–4 colours per material, picked per pixel by hash for grain. Principles:

- Terrain is **low saturation and dark**. Saturation is reserved for Bob, emitters and hazards.
- Each biome has a **two-colour light story**: meadow warm sun vs cool sky, cavern teal vs violet, foundry orange pour vs cool lamps, grotto firelight vs moonlight.
- Hazards are hot colours (lava, molten metal, toxic green). Bob must never be confused with one: hot Bob turning orange near lava is the one deliberate exception, because that *is* the danger signal.

## Bob's look

- Translucent jelly: interior pixels blend about 80% over what's behind him, and the rim is opaque and darker.
- Light from the top-left; a specular arc; lighter "subsurface" glow near his base.
- **Visibly made of particles**: the outline fizzes (each edge particle jostles in and out), stray particles orbit just outside his surface, and there are occasional gaps and specks inside. Controlled by a `loose` value: low when cold, high when hot or moving fast.
- **Hugs terrain**: his pixels never draw inside solids, so his base takes the shape of whatever he's sitting on.
- **Momentum shows**: he stretches along his velocity, his front leans in, and droplets lag behind.
- Eyes: 3×4 dark pixels with a glint. They squint when cold and droop when hot. A piece without eyes isn't "you".
- Colour options in the stills: coral (default), jelly cyan, lime, amber. Cyan disappears in the glow caverns and lime on grass, which is why coral is the default.

## What we want to settle

1. Camera size: is 320×180 right, or closer (240) for a more intimate feel?
2. Bob's colour, size and how "loose" he looks.
3. How dark caves should be by default (gameplay vs mood).
4. Is the back wall diggable/simulated, or decoration only?
5. How much bloom: it's lovely on fire, but heavy on big goo pools.
