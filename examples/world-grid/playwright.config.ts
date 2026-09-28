import { fileURLToPath } from "node:url";
import { defineConfig } from "playwright/test";

const subject = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    testDir: "./src",
    testMatch: "**/*.e2e.ts",
    fullyParallel: false,
    workers: 1,
    timeout: 70_000,
    globalTimeout: 70_000,
    reporter: "list",
    use: {
        browserName: "chromium",
        baseURL: "http://127.0.0.1:4174",
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        launchOptions: {
            args: [
                "--enable-unsafe-webgpu",
                "--enable-features=WebGPUDeveloperFeatures",
                "--enable-webgpu-developer-features",
                "--enable-gpu",
            ],
        },
    },
    webServer: {
        command: "bun run build && bun run preview --host 127.0.0.1 --port 4174 --strictPort",
        cwd: subject,
        url: "http://127.0.0.1:4174",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
