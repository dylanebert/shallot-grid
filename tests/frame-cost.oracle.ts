import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REAL_GPU_LAUNCH } from "@dylanebert/shallot/harness";
import { check } from "@dylanebert/shallot/harness/check";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dir, "..");
const EXAMPLE = resolve(ROOT, "examples/world-grid");
// inside the example so `@dylanebert/shallot-grid` resolves through the example's own node_modules
const PROJECT = resolve(EXAMPLE, ".frame-cost");
const SHALLOT = resolve(ROOT, "node_modules/@dylanebert/shallot/bin/shallot.ts");
const WIDTH = 1920;
const HEIGHT = 1080;
const BUDGET_MS = 0.5;

// the example's scene and plugins plus `Profile` and the cost hook, so the recipe never carries the profiler
function writeProject(): void {
    rmSync(PROJECT, { recursive: true, force: true });
    mkdirSync(PROJECT, { recursive: true });
    symlinkSync(resolve(EXAMPLE, "public"), resolve(PROJECT, "public"));
    const manifest = {
        kind: "recipe",
        scene: "scenes/main.scene",
        plugins: {
            Profile: true,
            Orbit: true,
            Grid: "@dylanebert/shallot-grid",
            FrameCostHarness: "../src/cost",
        },
    };
    writeFileSync(resolve(PROJECT, "shallot.json"), `${JSON.stringify(manifest, null, 4)}\n`);
}

async function waitForServer(url: string, server: Bun.Subprocess): Promise<void> {
    const deadline = performance.now() + 30_000;
    while (performance.now() < deadline) {
        if (server.exitCode !== null) throw new Error(`shallot dev exited with ${server.exitCode}`);
        try {
            if ((await fetch(url)).ok) return;
        } catch {}
        await Bun.sleep(100);
    }
    throw new Error(`shallot dev did not answer at ${url}`);
}

check(
    "the grid pass costs under 0.5 ms of GPU time at 1920x1080",
    {
        claim: "shallot-grid-frame-cost",
        size: "integration",
        requires: ["chromium"],
        subject: "src",
    },
    async () => {
        writeProject();
        // headless Chromium on a Linux Wayland host reaches only the SwiftShader fallback adapter; the
        // headed launch reaches the host GPU (see `src/world-grid.test.ts`)
        const browser = await chromium.launch({ headless: false, ...REAL_GPU_LAUNCH });
        const port = 4000 + Math.floor(Math.random() * 1000);
        const url = `http://localhost:${port}/`;
        const server = Bun.spawn(
            [
                process.execPath,
                SHALLOT,
                "dev",
                PROJECT,
                "--port",
                String(port),
                "--strict-port",
                "--no-open",
            ],
            { stdout: "ignore", stderr: "ignore" },
        );
        try {
            const page = await browser.newPage({
                viewport: { width: WIDTH, height: HEIGHT },
                deviceScaleFactor: 1,
            });
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await waitForServer(url, server);
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
            await page.waitForFunction(() => window.__harness?.ready === true, undefined, {
                timeout: 20_000,
            });
            const adapter = await page.evaluate(async () => {
                const info = (await navigator.gpu.requestAdapter())?.info;
                return info
                    ? `${info.vendor} ${info.architecture} ${info.description}`.trim()
                    : "none";
            });
            const verdict = await page.evaluate(() =>
                window.__harness?.run?.({ size: "integration", requires: ["chromium"] }),
            );
            const row = verdict?.checks?.[0];
            if (!verdict?.ok || !row)
                throw new Error(`frame-cost run refused: ${row?.detail ?? errors.join(" | ")}`);
            const data = row.data;
            if (!data) throw new Error("frame-cost run returned no measurement");
            console.log(
                `shallot-grid-frame-cost: grid pass ${data.meanMs.toFixed(4)} ms mean (${data.fires} passes, held peak ${data.peakMs.toFixed(4)} ms) at ${data.width}x${data.height}, camera y ${data.cameraY.toFixed(2)}, adapter ${adapter}, chromium ${browser.version()}`,
            );
            if (data.width !== WIDTH || data.height !== HEIGHT)
                throw new Error(`canvas is ${data.width}x${data.height}, not ${WIDTH}x${HEIGHT}`);
            if (!(data.meanMs <= BUDGET_MS))
                throw new Error(
                    `grid pass ${data.meanMs.toFixed(4)} ms exceeds the ${BUDGET_MS} ms budget`,
                );
            return verdict;
        } finally {
            await browser.close();
            server.kill();
            await server.exited;
            rmSync(PROJECT, { recursive: true, force: true });
        }
    },
);
