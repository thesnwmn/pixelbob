# 06 Prior art

| Work | What to take from it |
|---|---|
| **Noita** (Nolla Games) | The proof that a whole game can run on a falling-sand grid. Their GDC talk "Exploring the Tech and Design of Noita" covers chunked multithreaded updates, dirty rects, and rigid bodies from pixel clusters (with Box2D). Also the warning: emergent chaos needs design guard-rails |
| **The Powder Toy** / Falling Sand Game | A huge catalogue of materials, temperatures and reactions to borrow from, as data |
| **Sandspiel** (Max Bittker) | Falling sand in the browser: Rust compiled to WASM, rendered with WebGL, plus a fluid sim for wind. Shows what's doable on the web |
| **Gish** | A tar-ball platformer whose hero is a soft body: sticky, slippery and heavy states. The closest gameplay ancestor of Bob's states |
| **LocoRoco** | A blob that splits into many and merges back. Proof that "split to solve, merge to proceed" is fun and readable |
| **World of Goo** | Bonds that stretch and break as the core mechanic, and how much charm comes from the wobble |
| **Celeste / Ori** | Movement feel: coyote time, jump buffering, squash and stretch. Bob's sloppiness still needs these forgiveness tricks |
| **Terraria / Starbound** | Back-wall layer behind diggable terrain; light that bleeds a few tiles into solids |
| physpx (reference shots) | The target look: dark rock with dusty rims, warm halos on the back wall, hanging vines, glowing cave flora |

## Techniques

- **Falling-sand CA**: bottom-up update with alternating direction; a per-cell "updated" bit; chunks sleep when nothing changes.
- **Position Based Dynamics / XPBD** (Müller, Macklin): stable constraints whose stiffness doesn't depend on the step rate; the standard for real-time soft bodies.
- **Meshless shape matching** (Müller et al. 2005): blob-like bodies that return to their rest shape; adjusting the stiffness gives everything from jelly to liquid.
- **2D lighting**: shadow ray-marching on an occlusion grid (what the stills do), jump-flood distance fields for soft shadows, and radiance cascades (Sannikov) for many lights cheaply on the GPU.
