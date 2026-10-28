# Shallot Grid

Infinite world grid for [Shallot](https://github.com/dylanebert/shallot) 0.10.

```sh
bun add @dylanebert/shallot-grid
```

Add the plugin to your app's plugins and one entity to its world:

```ts
import { Grid, GridPlugin } from "@dylanebert/shallot-grid";

// In your app options:
plugins: [GridPlugin, /* your other plugins */]

// In your scene plugin's initialize(world):
const grid = world.create();
world.add(grid, Grid);
```

The grid draws in every camera with `StandardRenderer`. It lies on Y=0 with
colored X, Y and Z axes. Opaque objects hide it; transparent objects draw over it.

Override fields in `world.add(grid, Grid, { ... })`:

| Field | Default | Meaning |
| --- | --- | --- |
| `neutral` | `0x504945ff` | Grid line color |
| `axisX` | `0xcc241dff` | X axis color |
| `axisY` | `0x6b9d65ff` | Vertical Y axis color |
| `axisZ` | `0x458588ff` | Z axis color |
| `opacity` | `1` | Whole-grid opacity, 0–1 |
| `fade` | `20` | Horizon reach in camera heights; 0 disables fading |
| `cells` | `40` | Fine cells fade in from cells/10 to cells pixels |
| `floor` | `1` | Smallest cell size in meters |
| `xray` | `0` | Occluded opacity multiplier, 0–1 |

Colors are sRGB `0xRRGGBBAA`; alpha `00` hides an axis.

Line antialiasing follows Ben Golus's *The Best Darn Grid Shader (Yet)*;
decade weighting follows Blender's `overlay_grid_frag.glsl` pixel-size rule.
