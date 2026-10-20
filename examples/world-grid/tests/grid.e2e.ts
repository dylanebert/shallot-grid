import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

type Pose = { distance: number; yaw: number; pitch: number };
type GridWindow = Window & {
    orbitGrid(input: { wheel?: number; dx?: number; dy?: number }): Pose;
    captureGrid(): Promise<string>;
};

test("injected wheel and drag orbit from sub-metre to kilometres with grid and axes visible", async ({
    page,
}, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/tests/stepped.html");
    await page.waitForFunction(() => "captureGrid" in window);
    const initial = await page.evaluate(() => (window as unknown as GridWindow).orbitGrid({}));
    const turned = await page.evaluate(() =>
        (window as unknown as GridWindow).orbitGrid({ dx: 40, dy: 20 }),
    );
    expect(turned.yaw).not.toBe(initial.yaw);
    expect(turned.pitch).not.toBe(initial.pitch);
    // Orbit's wheel increment is zoomSpeed * max(0.3, distance * 0.08).
    for (const [name, distance] of [
        ["near", 0.7],
        ["mid", 30],
        ["far", 3000],
    ] as const) {
        const pose = await page.evaluate((target) => {
            const w = window as unknown as GridWindow;
            const before = w.orbitGrid({});
            return w.orbitGrid({
                wheel: (target - before.distance) / (0.025 * Math.max(0.3, before.distance * 0.08)),
            });
        }, distance);
        expect(pose.distance).toBeCloseTo(distance, 2);
        const png = await page.evaluate(() => (window as unknown as GridWindow).captureGrid());
        await writeFile(info.outputPath(`${name}.png`), Buffer.from(png.split(",")[1]!, "base64"));
        const counts = await page.evaluate(async (data) => {
            const image = await createImageBitmap(await (await fetch(data)).blob());
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
            image.close();
            const counts = { lines: 0, red: 0, green: 0, blue: 0 };
            for (let i = 0; i < rgba.length; i += 4) {
                const r = rgba[i]!;
                const g = rgba[i + 1]!;
                const b = rgba[i + 2]!;
                if (Math.max(r, g, b) - Math.min(r, g, b) < 16 && r > 32) counts.lines++;
                if (r > g * 1.5 && r > b * 1.5) counts.red++;
                if (g > r * 1.2 && g > b * 1.2) counts.green++;
                if (b > r * 1.5 && b > g) counts.blue++;
            }
            return counts;
        }, png);
        expect(counts.lines, name).toBeGreaterThan(100);
        expect(counts.red, name).toBeGreaterThan(30);
        expect(counts.green, name).toBeGreaterThan(30);
        expect(counts.blue, name).toBeGreaterThan(30);
    }
    expect(errors).toEqual([]);
});
