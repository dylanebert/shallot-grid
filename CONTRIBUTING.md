# Contributing

```sh
bun install --frozen-lockfile
bun test tests/calculations.test.ts
bun test tests/grid.gpu.test.ts
bun check
bun run lint
bun run test
```

- Import Shallot only through public exports; the dev dependency pins the published version and the peer dependency names the compatibility range
- `tests/calculations.test.ts` checks colour decoding and decade selection; `tests/grid.gpu.test.ts` checks rendering on headless Dawn (`webgpu`), including both camera antialias modes
- Show changed GPU assertions red by breaking their rendering rule and record those failures in the commit message
- GPU state belongs to a world resource, never a module singleton
