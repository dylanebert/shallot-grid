import { resolve } from "node:path";
import { runBrowserCheck } from "@dylanebert/shallot/harness";
import { check } from "@dylanebert/shallot/harness/check";

const ROOT = resolve(import.meta.dir, "..");
const EXAMPLE = resolve(ROOT, "examples/world-grid");
const SHALLOT = resolve(ROOT, "node_modules/@dylanebert/shallot/bin/shallot.ts");
const FRAMES = [
    ...[0.5, 50, 5000].flatMap((height) =>
        ["neutral", "axisX", "axisZ", "axisY"].map((probe) => `${probe} at ${height} m`),
    ),
    "near quarter unfilled at 0.5 m grazing",
    "neutral lines past the far plane at 50 m",
    "no decade finer than 1 m at 0.2 m",
    "Y axis unbroken below the ground",
    "box hides the grid at xray 0",
    "grid lines cross the box at xray 1",
].sort();

check(
    "the world-grid example draws neutral lines and all three axes at 0.5, 50 and 5000 m, keeps its look at the near, far and floor frames, keeps the Y axis whole under the lines, and hides behind the box unless xray",
    {
        claim: "the grid vanishes at some camera height or drops an axis line",
        size: "integration",
        requires: ["chromium"],
        host: "mac",
        subject: "src",
    },
    async () => {
        const verdict = await runBrowserCheck((port) => [
            process.execPath,
            SHALLOT,
            "dev",
            EXAMPLE,
            "--port",
            String(port),
            "--strict-port",
            "--no-open",
        ]);
        const failed = (verdict.checks ?? []).filter((c) => !c.ok);
        const names = (verdict.checks ?? []).map((c) => c.name).sort();
        const exact = names.length === FRAMES.length && names.every((n, i) => n === FRAMES[i]);
        if (!verdict.ok || !exact) {
            throw new Error(
                `world-grid frames failed ${failed.length}/${verdict.checks?.length ?? 0}, got [${names.join(", ")}]:\n${failed.map((c) => `${c.name}: ${c.detail}`).join("\n")}`,
            );
        }
        return verdict;
    },
);
