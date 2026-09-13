import { resolve } from "node:path";
import { runBrowserCheck } from "@dylanebert/shallot/harness";
import { check } from "@dylanebert/shallot/harness/check";

const ROOT = resolve(import.meta.dir, "..");
const EXAMPLE = resolve(ROOT, "examples/world-grid");
const SHALLOT = resolve(ROOT, "node_modules/@dylanebert/shallot/bin/shallot.ts");

check(
    "the world-grid example draws neutral lines and all three axes at 0.5, 50 and 5000 m, keeps its look at the near, far and floor frames, keeps the Y axis whole under the lines, and hides behind the box unless xray",
    {
        claim: "the grid vanishes at some camera height or drops an axis line",
        size: "integration",
        requires: ["chromium"],
        subject: "src",
    },
    async () => {
        const verdict = await runBrowserCheck(
            (port) => [
                process.execPath,
                SHALLOT,
                "dev",
                EXAMPLE,
                "--port",
                String(port),
                "--strict-port",
                "--no-open",
            ],
            // headless Chromium on a Linux Wayland host reaches only the SwiftShader fallback adapter, which
            // loses its device before the first frame; the headed launch reaches the host GPU
            { headless: false },
        );
        const failed = (verdict.checks ?? []).filter((c) => !c.ok);
        if (!verdict.ok || (verdict.checks ?? []).length !== 18) {
            throw new Error(
                `world-grid frames failed ${failed.length}/${verdict.checks?.length ?? 0}:\n${failed.map((c) => `${c.name}: ${c.detail}`).join("\n")}`,
            );
        }
        return verdict;
    },
);
