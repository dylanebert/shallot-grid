import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("npm publish selects next only for hyphenated package versions", () => {
    const workflow = readFileSync(
        join(import.meta.dir, "../.github/workflows/release.yml"),
        "utf8",
    );
    expect(workflow).toContain('PACKAGE_VERSION="$(jq -r .version package.json)"');
    const argsBlock = workflow.match(
        /publish_args=\(--access public\)\n\s+if \[\[ "\$PACKAGE_VERSION" == \*-\* \]\]; then\n\s+publish_args\+=\(--tag next\)\n\s+fi/,
    )?.[0];
    if (!argsBlock) throw new Error("release.yml has no recognized npm dist-tag logic");
    expect(workflow).toContain(`bun publish "\${publish_args[@]}"`);

    const cases: [string, string[]][] = [
        ["0.2.0-next.1", ["--access", "public", "--tag", "next"]],
        ["0.2.0", ["--access", "public"]],
    ];
    for (const [version, expected] of cases) {
        const result = Bun.spawnSync(
            ["bash", "-c", `${argsBlock}\nprintf '%s\\n' "\${publish_args[@]}"`],
            {
                env: { ...process.env, PACKAGE_VERSION: version },
                stdout: "pipe",
                stderr: "pipe",
            },
        );
        const output = `${result.stdout.toString()}${result.stderr.toString()}`;
        if (result.exitCode !== 0)
            throw new Error(`publish args for ${version} failed:\n${output}`);
        const args = result.stdout.toString().trim().split("\n");
        expect(args).toEqual(expected);
        console.log(`${version}: bun publish ${args.join(" ")}`);
    }
});
