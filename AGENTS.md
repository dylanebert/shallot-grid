# Shallot-Grid Contract

This repository develops `@dylanebert/shallot-grid` against the qualified Shallot source candidate:

```text
github:dylanebert/shallot#70770cfc34d82fdd19cb705d8753bb6f093748d6
```

The exact Git identity belongs in `devDependencies` and in `bun.lock`; the peer range describes compatibility and is not the package used by this repository's gates.

## Package States

Use one of these states deliberately:

- **Local development** is an uncommitted source override. First prove Bun 1.4.2 and record the consumer `package.json` and `bun.lock` SHA-256 values. In the Shallot checkout, register the package with `bun link`. In this repository, enter the override with `bun link @dylanebert/shallot --no-save`. Prove that `node_modules/@dylanebert/shallot` resolves with `python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' node_modules/@dylanebert/shallot` to the recorded Shallot checkout, and record the producer commit and dirty state. The consumer manifest and lock must retain their entry hashes. Exit with `bun install --force --frozen-lockfile --cache-dir <empty-cache>`, prove the installed package is no longer the producer checkout and records the full Git SHA above, and require the original manifest and lock hashes. Unregister the producer with `bun unlink` when the override is no longer needed.
- **Remote source staging** is the committed exact Git identity above. A cold proof removes `node_modules`, creates an explicitly empty cache, asserts `bun --version` is exactly `1.4.2`, and runs `bun install --frozen-lockfile --cache-dir <empty-cache>`. This state proves tracked source bytes, the declared exports used by the plugin and checks, and the carrier. It does not prove packed `files` filtering or generated `dist/vite.js`; those are artifact-stage claims.
- **Published use** keeps the `^0.10.0` peer compatibility contract and uses one exact published development version when a release is selected. A published artifact must be installed from its frozen lock and checked as a packed artifact. Publication is a release operation, not a way to observe development changes.

Every state transition proves the declared identity, the resolved identity, what shape the state actually provides, and a clean restoration or explicit committed update. No local link or temporary pack belongs in a commit. Do not add a consumer-specific Shallot build or a private Shallot import to compensate for a missing source seam.

When a consumer application uses this plugin, Vite must dedupe both `@dylanebert/shallot` and `typegpu` so the plugin and host share their engine instances. The example's harness imports the checked-out Grid source so its browser gate cannot resolve a prior published Grid; shipped consumers continue to use the package root and declared Shallot subpaths.
