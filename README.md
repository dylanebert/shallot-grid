# shallot-grid

An infinite world grid with axis lines for [Shallot](https://github.com/dylanebert/shallot). One fullscreen pass draws the y=0 plane. Each pixel picks two decade levels per line direction from its own screen footprint and cross-fades between them, so the grid reads at any zoom without popping. The horizon fade scales with camera height, and red X, green Y and blue Z axis lines draw in the same pass.

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
<a grid="neutral: 0x504945ff; axis-x: 0xcc241dff; axis-y: 0x6b9d65ff; axis-z: 0x458588ff; opacity: 1; fade: 20; cells: 40; floor: 1; xray: 0" />
```

Axes are drawn 1 px wide, the same as grid lines, so color and alpha are the only difference. The Y axis always draws over the grid lines, and below the ground it draws at half its alpha.

- `opacity`: the whole grid's opacity.
- `fade`: horizon fade reach in camera heights; `0` turns it off.
- `cells`: pixels per cell at a decade boundary; the finest level fades in as its cells grow from `cells / 10` to `cells` pixels, so at `40` it is gone by 4 px and full by 40 px.
- `floor`: the smallest cell in metres; no finer decade draws, and closer in that level grows on screen.
- `xray`: how much of the grid draws through scene geometry, from `0` to `1`. At `0` objects hide the grid behind them, at `1` it draws over them, and values in between ghost it.

## Layout

- `src/`: the plugin (`index.ts`) and its shader (`shader.ts`)
- `examples/world-grid`: I want an infinite reference grid with world axes under my scene. Run it with `bunx shallot dev examples/world-grid`.
- `tests/frame-cost.oracle.ts`: the `shallot-grid-frame-cost` oracle, which profiles the example at 1920×1080 in headed Chromium and refuses a grid pass over 0.5 ms of GPU time

## Developing

```bash
bun install --frozen-lockfile
bun run list                # installed Shallot carrier population
bun run workflow            # regenerate the hosted surface workflow
bun run check               # tsc + Biome + carrier declaration/drift checks
bun run test                # installed carrier unit sweep (src/)
bun test ./tests/frame-cost.oracle.ts   # grid pass GPU cost at 1080p (headed Chromium, host GPU)
```

### Linking to a local engine

To iterate against an unreleased engine, keep the published range in `package.json` and link at the consumer. Run `bun link` here once, then `bun link @dylanebert/shallot-grid` in the consumer and set `resolve.dedupe: ["@dylanebert/shallot", "typegpu"]` in its Vite config. The linked plugin runs on the consumer's engine and typegpu instead of its own copies. To return to the registry, run `bun install` in the consumer.

## Releasing

Bump `version` in `package.json`, commit, and push a matching `v<version>` tag. The release workflow runs the native `bun run check` and `bun run test` gates before publishing.

## License

MIT
