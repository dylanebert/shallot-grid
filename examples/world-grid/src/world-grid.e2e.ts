import { expect, type Page, test } from "playwright/test";
import type { WorldGridControl } from "./check-controller";

interface Image {
    width: number;
    height: number;
    rgba: Uint8Array | Uint8ClampedArray;
}

interface Band {
    r: [number, number];
    g: [number, number];
    b: [number, number];
    minPixels: number;
    minSpan: number;
}

interface Measurement {
    pixels: number;
    width: number;
    height: number;
}

interface Box {
    position: number[];
    scale: number[];
    inverseViewProj: number[];
}

const HEIGHTS = [0.5, 50, 5000];
const PITCH = 0.5;
const GRAZE = 0.1;
const FLOOR_REACH = 8;
const NEAR_FILL = 0.05;

async function invoke<T>(
    page: Page,
    method: keyof WorldGridControl,
    ...args: unknown[]
): Promise<T> {
    const result = await page.evaluate(
        ({ name, values }) => {
            const app = window.worldGridControl;
            if (!app) throw new Error("world-grid check controller is not ready");
            const operation = app[name] as (...values: unknown[]) => unknown;
            return operation.apply(app, values);
        },
        { name: method, values: args },
    );
    return result as T;
}

async function pose(page: Page, height: number, pitch = PITCH) {
    return page.evaluate(
        ([nextHeight, nextPitch]) => window.worldGridControl!.pose(nextHeight, nextPitch),
        [height, pitch],
    );
}

async function capture(page: Page): Promise<Image> {
    const image = await page.evaluate(() => window.worldGridControl!.capture());
    return { width: image.width, height: image.height, rgba: Buffer.from(image.rgba, "base64") };
}

function bands(width: number, height: number): Record<string, Band> {
    const quarter = Math.floor(Math.max(width, height) / 4);
    return {
        neutral: {
            minPixels: 2000,
            minSpan: Math.floor(width / 2) + 1,
            r: [40, 96],
            g: [30, 88],
            b: [22, 80],
        },
        axisX: {
            minPixels: 100,
            minSpan: quarter,
            r: [120, 255],
            g: [0, 64],
            b: [0, 64],
        },
        axisZ: {
            minPixels: 100,
            minSpan: quarter,
            r: [16, 96],
            g: [96, 176],
            b: [100, 176],
        },
        axisY: {
            minPixels: 40,
            minSpan: Math.floor(height / 4),
            // The center-column 1 px axis splits across two pixels around (56,104,48); green excludes neutral and blue excludes Z.
            r: [32, 100],
            g: [88, 192],
            b: [24, 88],
        },
    };
}

function scan(
    image: Image,
    band: Band,
    region = { x0: 0, y0: 0, x1: image.width, y1: image.height },
): Measurement {
    let pixels = 0;
    let minX = image.width;
    let minY = image.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = region.y0; y < region.y1; y++) {
        for (let x = region.x0; x < region.x1; x++) {
            const i = (y * image.width + x) * 4;
            const r = image.rgba[i] ?? 0;
            const g = image.rgba[i + 1] ?? 0;
            const b = image.rgba[i + 2] ?? 0;
            if (
                r < band.r[0] ||
                r > band.r[1] ||
                g < band.g[0] ||
                g > band.g[1] ||
                b < band.b[0] ||
                b > band.b[1]
            )
                continue;
            pixels++;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    return {
        pixels,
        width: pixels ? maxX - minX + 1 : 0,
        height: pixels ? maxY - minY + 1 : 0,
    };
}

function matches(image: Image, i: number, band: Band): boolean {
    const r = image.rgba[i] ?? 0;
    const g = image.rgba[i + 1] ?? 0;
    const b = image.rgba[i + 2] ?? 0;
    return (
        r >= band.r[0] &&
        r <= band.r[1] &&
        g >= band.g[0] &&
        g <= band.g[1] &&
        b >= band.b[0] &&
        b <= band.b[1]
    );
}

function passes(image: Image, name: string, band: Band, region?: Parameters<typeof scan>[2]) {
    const result = scan(image, band, region);
    expect(result.pixels, `${name}: matching pixels`).toBeGreaterThanOrEqual(band.minPixels);
    expect(Math.max(result.width, result.height), `${name}: matching span`).toBeGreaterThanOrEqual(
        band.minSpan,
    );
    return result;
}

function greenish(image: Image, i: number): boolean {
    const r = image.rgba[i] ?? 0;
    const g = image.rgba[i + 1] ?? 0;
    const b = image.rgba[i + 2] ?? 0;
    return g >= 48 && g >= r + 16 && g >= b + 16;
}

function boxMask(box: Box, image: Image): Uint8Array {
    const m = box.inverseViewProj;
    const [cx = 0, cy = 0, cz = 0] = box.position;
    const [sx = 0, sy = 0, sz = 0] = box.scale;
    const minX = cx - sx * 0.4;
    const minY = cy - sy * 0.4;
    const minZ = cz - sz * 0.4;
    const maxX = cx + sx * 0.4;
    const maxY = cy + sy * 0.4;
    const maxZ = cz + sz * 0.4;
    const mask = new Uint8Array(image.width * image.height);
    for (let py = 0; py < image.height; py++) {
        const ny = 1 - (2 * (py + 0.5)) / image.height;
        const rowX = (m[4] ?? 0) * ny + (m[12] ?? 0);
        for (let px = 0; px < image.width; px++) {
            const nx = (2 * (px + 0.5)) / image.width - 1;
            const baseX = (m[0] ?? 0) * nx + rowX;
            const nearW = (m[3] ?? 0) * nx + (m[7] ?? 0) * ny + (m[11] ?? 0) + (m[15] ?? 0);
            const farW = (m[3] ?? 0) * nx + (m[7] ?? 0) * ny + (m[15] ?? 0);
            const ox = (baseX + (m[8] ?? 0)) / nearW;
            const oy = ((m[1] ?? 0) * nx + (m[5] ?? 0) * ny + (m[9] ?? 0) + (m[13] ?? 0)) / nearW;
            const oz = ((m[2] ?? 0) * nx + (m[6] ?? 0) * ny + (m[10] ?? 0) + (m[14] ?? 0)) / nearW;
            const fx = baseX / farW;
            const fy = ((m[1] ?? 0) * nx + (m[5] ?? 0) * ny + (m[13] ?? 0)) / farW;
            const fz = ((m[2] ?? 0) * nx + (m[6] ?? 0) * ny + (m[14] ?? 0)) / farW;
            let t0 = 0;
            let t1 = 1;
            for (let k = 0; k < 3 && t0 <= t1; k++) {
                const o = k === 0 ? ox : k === 1 ? oy : oz;
                const d = (k === 0 ? fx : k === 1 ? fy : fz) - o;
                const lo = k === 0 ? minX : k === 1 ? minY : minZ;
                const hi = k === 0 ? maxX : k === 1 ? maxY : maxZ;
                if (Math.abs(d) < 1e-12) {
                    if (o < lo || o > hi) t0 = 2;
                    continue;
                }
                const a = (lo - o) / d;
                const b = (hi - o) / d;
                t0 = Math.max(t0, Math.min(a, b));
                t1 = Math.min(t1, Math.max(a, b));
            }
            if (t0 <= t1) mask[py * image.width + px] = 1;
        }
    }
    return mask;
}

async function measured(name: string, run: () => Promise<void>) {
    await test.step(name, run);
}

test("a world-grid frame fails or goes missing", async ({ page }) => {
    await page.goto("/?check");
    await page.waitForFunction(() => Boolean(window.worldGridControl));
    expect(
        await invoke<boolean>(page, "deviceAvailable"),
        "the app acquired its WebGPU device",
    ).toBe(true);

    for (const height of HEIGHTS) {
        const y = await pose(page, height);
        const image = await capture(page);
        expect(image.width).toBe(1280);
        expect(image.height).toBe(720);
        const probes = bands(image.width, image.height);
        for (const [name, band] of Object.entries(probes)) {
            await measured(`${name} at ${height} m`, async () => {
                const center = Math.floor(image.width / 2);
                const region =
                    name === "axisY"
                        ? {
                              x0: Math.max(0, center - 6),
                              y0: 0,
                              x1: Math.min(image.width, center + 7),
                              y1: image.height,
                          }
                        : undefined;
                const result = passes(
                    image,
                    `${name} at ${height} m (camera y ${y.toFixed(3)})`,
                    band,
                    region,
                );
                expect(result.pixels).toBeGreaterThanOrEqual(band.minPixels);
            });
        }
    }

    const originalFar = await invoke<number>(page, "cameraFar");
    const originalFade = await invoke<number>(page, "gridFade");
    const originalAxisY = await invoke<number>(page, "gridAxisY");
    const originalXray = await invoke<number>(page, "gridXray");
    const tanHalf = Math.tan(((await invoke<number>(page, "cameraFov")) * Math.PI) / 360);

    try {
        await measured("near quarter unfilled at 0.5 m grazing", async () => {
            const y = await pose(page, 0.5, GRAZE);
            const image = await capture(page);
            const band = bands(image.width, image.height).neutral;
            const top = Math.floor((image.height * 3) / 4);
            const result = scan(image, band, { x0: 0, y0: top, x1: image.width, y1: image.height });
            const fill = result.pixels / ((image.height - top) * image.width);
            expect(
                fill,
                `camera y ${y.toFixed(3)}, neutral fill ${fill.toFixed(4)} (limit ${NEAR_FILL})`,
            ).toBeLessThan(NEAR_FILL);
        });

        await measured("neutral lines past the far plane at 50 m", async () => {
            await invoke<void>(page, "setCameraFar", 1000);
            await invoke<void>(page, "setGridFade", 100);
            const y = await pose(page, 50, PITCH);
            const image = await capture(page);
            const band = bands(image.width, image.height).neutral;
            const ndc = (Math.sin(PITCH) - y / 1000) / (tanHalf * Math.cos(PITCH));
            const farRow = Math.floor(((1 - ndc) / 2) * image.height);
            const rows = Math.max(0, farRow - 2);
            const result = passes(
                image,
                `camera y ${y.toFixed(3)}, far row ${farRow} of ${image.height}`,
                { ...band, minPixels: 50, minSpan: Math.floor(image.width / 8) },
                { x0: 0, y0: 0, x1: image.width, y1: rows },
            );
            expect(rows, `far row ${farRow} leaves no rows above it`).toBeGreaterThan(0);
            expect(result.pixels).toBeGreaterThanOrEqual(50);
            await invoke<void>(page, "setCameraFar", originalFar);
        });

        await measured("no decade finer than 1 m at 0.2 m", async () => {
            await invoke<void>(page, "setGridFade", 0);
            await invoke<void>(page, "setGridAxisY", originalAxisY & ~0xff);
            const y = await pose(page, 0.2, PITCH);
            const image = await capture(page);
            const band = bands(image.width, image.height).neutral;
            const x = Math.floor(image.width / 2);
            const tanHalfFov = tanHalf;
            const sinP = Math.sin(PITCH);
            const cosP = Math.cos(PITCH);
            const along = (row: number) => {
                const n = (1 - (2 * (row + 0.5)) / image.height) * tanHalfFov;
                return (y * (cosP + n * sinP)) / (sinP - n * cosP) - y / Math.tan(PITCH);
            };
            const runs: number[] = [];
            let start = -1;
            for (let row = image.height - 1; row >= -1; row--) {
                const s = row >= 0 ? along(row) : Number.POSITIVE_INFINITY;
                const on =
                    row >= 0 &&
                    s > 0.05 &&
                    s < FLOOR_REACH &&
                    matches(image, (row * image.width + x) * 4, band);
                if (on && start < 0) start = row;
                if (!on && start >= 0) {
                    runs.push(along((start + row + 1) / 2));
                    start = -1;
                }
            }
            let spacing = Number.POSITIVE_INFINITY;
            for (let i = 1; i < runs.length; i++)
                spacing = Math.min(spacing, (runs[i] ?? 0) - (runs[i - 1] ?? 0));
            expect(
                runs.length,
                `camera y ${y.toFixed(3)}, line runs ${runs.map((r) => r.toFixed(2)).join(",")}`,
            ).toBeGreaterThanOrEqual(2);
            expect(spacing, `minimum spacing ${spacing.toFixed(3)} m`).toBeGreaterThanOrEqual(
                Math.SQRT2 * 0.8,
            );
            await invoke<void>(page, "setCameraFar", originalFar);
            await invoke<void>(page, "setGridFade", originalFade);
            await invoke<void>(page, "setGridAxisY", originalAxisY);
        });

        await measured("Y axis unbroken below the ground", async () => {
            const y = await pose(page, 5, PITCH);
            const image = await capture(page);
            const probes = bands(image.width, image.height);
            const cx = Math.floor(image.width / 2);
            const cy = Math.floor(image.height / 2);
            let gaps = 0;
            let crossings = 0;
            for (let row = cy + 12; row < image.height; row++) {
                let green = false;
                let line = false;
                for (let x = cx - 6; x <= cx + 6; x++) {
                    const i = (row * image.width + x) * 4;
                    if (greenish(image, i)) green = true;
                    if (matches(image, i, probes.neutral)) line = true;
                }
                if (!green) gaps++;
                if (line) crossings++;
            }
            expect(gaps, `camera y ${y.toFixed(3)}, missing green axis rows`).toBe(0);
            expect(crossings, "neutral grid lines cross the Y axis").toBeGreaterThan(0);
        });

        for (const xray of [0, 1]) {
            await measured(
                xray === 0 ? "box hides the grid at xray 0" : "grid lines cross the box at xray 1",
                async () => {
                    await invoke<void>(page, "setGridXray", xray);
                    const y = await pose(page, 4, PITCH);
                    const image = await capture(page);
                    const probes = bands(image.width, image.height);
                    const box = await invoke<Box | null>(page, "box");
                    expect(box, "the scene has a box to occlude the grid").not.toBeNull();
                    if (!box) return;
                    const mask = boxMask(box, image);
                    const inside = mask.reduce((n, m) => n + m, 0);
                    const masked = { ...image, rgba: new Uint8ClampedArray(image.rgba.length) };
                    let hits = 0;
                    let x0 = image.width;
                    let x1 = -1;
                    for (let p = 0; p < mask.length; p++) {
                        if (!mask[p]) continue;
                        const i = p * 4;
                        const x = p % image.width;
                        x0 = Math.min(x0, x);
                        x1 = Math.max(x1, x);
                        if (
                            xray === 0 &&
                            Object.values(probes).some((band) => matches(image, i, band))
                        )
                            hits++;
                        masked.rgba[i] = image.rgba[i] ?? 0;
                        masked.rgba[i + 1] = image.rgba[i + 1] ?? 0;
                        masked.rgba[i + 2] = image.rgba[i + 2] ?? 0;
                        masked.rgba[i + 3] = image.rgba[i + 3] ?? 0;
                    }
                    expect(inside, `camera y ${y.toFixed(3)}, box pixels`).toBeGreaterThan(500);
                    if (xray === 0) {
                        expect(hits, "grid-colored pixels inside the box").toBe(0);
                    } else {
                        const result = scan(masked, {
                            ...probes.neutral,
                            minPixels: 20,
                            minSpan: Math.max(1, Math.floor((x1 - x0) / 3)),
                        });
                        expect(
                            result.pixels,
                            "neutral pixels inside the box",
                        ).toBeGreaterThanOrEqual(20);
                        expect(
                            Math.max(result.width, result.height),
                            "neutral line span inside the box",
                        ).toBeGreaterThanOrEqual(Math.max(1, Math.floor((x1 - x0) / 3)));
                    }
                },
            );
        }
    } finally {
        await invoke<void>(page, "setCameraFar", originalFar);
        await invoke<void>(page, "setGridFade", originalFade);
        await invoke<void>(page, "setGridAxisY", originalAxisY);
        await invoke<void>(page, "setGridXray", originalXray);
        await pose(page, HEIGHTS[0] ?? 0.5);
    }
});
