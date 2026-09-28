# Archive

Retired units live in Git tags, not in the tree; check one out at its tag to read or rebuild it.

| Name | Tag | Path at tag | Retired because | Rebuild as |
|---|---|---|---|---|
| world-grid browser row | `archive/browser-row` | `src/world-grid.test.ts` | It required Shallot's Chromium seat, retired whole on 2026-09-19, so it printed unrun and exited green on every host. | Rebuilt as Playwright Test at `examples/world-grid/src/world-grid.e2e.ts`, against the example's own Vite preview. |
