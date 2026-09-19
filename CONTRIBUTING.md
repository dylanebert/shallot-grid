# Contributing

For anyone changing the grid, person or agent. Each API's contract is the JSDoc beside it. This page holds what the tree, the scripts and a failing check do not say.

```bash
bun install --frozen-lockfile
bun run check
bun run test
bun run list
bun run workflow
```

- `src/` is the plugin and its shader. `examples/world-grid` is the one example; it shows the grid in a running scene, and its harness imports the checked-out source so it always draws the Grid in this tree, while a shipped consumer uses the package root and Shallot's declared subpaths. Retired rows: [`ARCHIVE.md`](ARCHIVE.md).
- `peerDependencies` is the compatibility range. The dev dependency and `bun.lock` carry a full-SHA Git pin of Shallot until a stable release replaces it. A consumer's Vite config dedupes `@dylanebert/shallot` and `typegpu` so plugin and host share one engine. Never add a consumer-specific Shallot build or a private Shallot import to cover a missing seam. Package states, linking and exit: [Shallot's CONTRIBUTING](https://github.com/dylanebert/shallot/blob/main/CONTRIBUTING.md#pins-and-dependencies).
- A release is a `v<version>` tag matching `package.json`. The release workflow runs `check` and `test` before publishing.
