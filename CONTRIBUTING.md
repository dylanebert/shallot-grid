# Contributing

For anyone changing the grid, person or agent. Each API's contract is the JSDoc beside it. This page holds what the tree, the scripts and a failing check do not say.

```bash
bun install --frozen-lockfile
bun run check
bun run test
bun run test:gpu
bun run test:browser
```

- `src/` holds the plugin and shader. `*.test.ts` is the cheap Bun tier; `*.gpu.ts` is run by path as a named GPU tier.
- `examples/world-grid` is the runnable Vite app and browser subject. Its `vite.config.ts` uses `shallot()` and its Playwright check runs against its own `vite preview`.
- `check` runs TypeScript and Biome. `test` runs the cheap tier; named tiers stay out of it.
- `peerDependencies` is the compatibility range. The dev dependency and `bun.lock` carry a full-SHA Git pin of Shallot until a stable release replaces it. A project owns its page and Vite config; `shallot()` supplies the engine transform and project integration, so do not add a second TypeGPU plugin or Shallot/typegpu `optimizeDeps` or `dedupe` entries.
- A release is a `v<version>` tag matching `package.json`. The release workflow runs `check` and the cheap `test` tier before publishing; the main test workflow runs every named tier too.
