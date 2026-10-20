# Contributing

```sh
bun install --frozen-lockfile
bun test tests/calculations.test.ts
bun test tests/grid.gpu.test.ts
bun test examples/world-grid/src/scene/scene.gpu.test.ts
bun test ./examples/world-grid/tests/grid.node.ts
bunx playwright test -c examples/world-grid --workers=1
(cd examples/world-grid && bun check)
bun check
bun run lint
bun run test
```

- Import Shallot only through public exports; the dev dependency pins the published version and the peer dependency names the compatibility range
- `tests/calculations.test.ts` checks colour decoding and decade selection; `tests/grid.gpu.test.ts` checks rendering on headless Dawn (`webgpu`), including both camera antialias modes
- Show changed GPU assertions red by breaking their rendering rule and record those failures in the commit message
- GPU state belongs to a world resource, never a module singleton
- `examples/world-grid` is a copyable app: its scene check sits beside its plugin, its composed rendering goal is `tests/grid.node.ts`, and its stepped browser check injects input through Shallot's input API and writes `near.png`, `mid.png` and `far.png` to Playwright's output directory
- Run the interactive example with `cd examples/world-grid && bunx vite`; left-drag orbits, the wheel zooms from 0.2 m to 10 km
