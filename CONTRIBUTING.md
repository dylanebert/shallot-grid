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
- `examples/world-grid` is a directory of this package: its Vite config uses `shallot()`, and its Playwright check runs against this package's Vite preview. The package owns the app scripts and dependencies; the example has no manifest or tsconfig of its own.
- `check` runs the package's single TypeScript config and Biome. `test` runs the cheap tier; named tiers stay out of it.
- `peerDependencies` is the Shallot compatibility range, and the dev dependency supplies the pinned prerelease for development and tests. The Bun tests do not load engine TGSL, so they need no Bun preload. A project owns its page and Vite config; `shallot()` supplies the engine transform and project integration, so do not add a second TypeGPU plugin or Shallot/typegpu `optimizeDeps` or `dedupe` entries.
- Publish a version from a commit whose `package.json` contains it, with one `v<version>` tag per published version. The release workflow requires the tag to match and publishes a hyphenated version under npm's `next` tag; a stable version goes under `latest`. `main` carries the next unpublished version and moves forward after each publish. The workflow runs `check` and the cheap `test` tier before publishing; the main test workflow runs every named tier too.
