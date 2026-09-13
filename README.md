# shallot-grid

An infinite world grid with axis lines for [Shallot](https://github.com/dylanebert/shallot). A fullscreen ray-plane pass that blends decade levels so it reads at any zoom, with X, Y and Z axis lines.

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
<a grid="neutral: 0x504945; axisX: 0xcc241d; axisY: 0x6b9d65; axisZ: 0x458588; opacity: 1; fade: 1; cells: 4" />
```

## Layout

- `src/`: the plugin (`index.ts`)
- `examples/`: sample Shallot projects (in development)

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
