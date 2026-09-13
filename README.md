# shallot-grid

An infinite world grid with axis lines for [Shallot](https://github.com/dylanebert/shallot). One fullscreen pass draws the y=0 plane. Each pixel picks two decade levels from its own screen footprint and cross-fades between them, so the grid reads at any zoom without popping. The horizon fade scales with camera height, and red X, green Y and blue Z axis lines draw in the same pass.

## Enabling it

```bash
bun add @dylanebert/shallot-grid
```

Name it in `shallot.json`:

```json
{
    "scene": "scenes/main.scene",
    "plugins": {
        "Grid": "@dylanebert/shallot-grid"
    }
}
```

Add a `<a grid />` singleton to your scene to show it:

```
<a grid />
```

Every field is optional. Colors are sRGB hex with alpha (`0xRRGGBBAA`), and an axis with alpha `00` is hidden:

```
<a grid="neutral: 0x504945ff; axis-x: 0xcc241dff; axis-y: 0x6b9d65ff; axis-z: 0x458588ff; opacity: 1; fade: 20; cells: 10" />
```

- `opacity`: the whole grid's opacity.
- `fade`: horizon fade reach in camera heights; `0` turns it off.
- `cells`: pixels per cell at a decade boundary; the finest level's cells span `cells / 10` to `cells` pixels.

## Layout

- `src/`: the plugin (`index.ts`) and its shader (`shader.ts`)
- `examples/world-grid`: I want an infinite reference grid with world axes under my scene. Run it with `bunx shallot dev examples/world-grid`.

## Developing

```bash
bun install --frozen-lockfile
bun run list                # installed Shallot carrier population
bun run workflow            # regenerate the hosted surface workflow
bun run check               # tsc + Biome + carrier declaration/drift checks
bun run test                # installed carrier unit sweep (src/)
```

### Against a local engine

`@dylanebert/shallot` is a peer dependency on the published range `>=0.9.5`; the dev dependency is pinned to the exact Git commit. To test against an unreleased engine, link it and its `typegpu` too:

```bash
# in your shallot checkout
bun link
cd node_modules/typegpu && bun link

# here
bun link @dylanebert/shallot
bun link typegpu
bun test src
```

Run `bun install --frozen-lockfile --force` here to replace the local links with the exact Shallot dependency recorded in `bun.lock`.

## Releasing

Bump `version` in `package.json`, commit, and push a matching `v<version>` tag. The release workflow runs the native `bun run check` and `bun run test` gates before publishing.

## License

MIT
