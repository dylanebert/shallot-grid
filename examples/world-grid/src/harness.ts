import { type Plugin, type State, Transform } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import { type Check, installHarness, type PixelProbe, pixelProbePass, probePixels } from "@dylanebert/shallot/harness";

// Verification hook for the chromium row in `src/world-grid.test.ts`, not part of the recipe: poses the
// orbit camera at each height, captures the composited canvas, and classifies the frame's grid pixels.
const HEIGHTS = [0.5, 50, 5000];

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

// A WebGPU canvas holds its frame only until the task that rendered it ends, so the read happens inside a
// frame callback queued after the engine's own.
async function capture(canvas: HTMLCanvasElement): Promise<ImageData> {
    const url = await new Promise<string>((done) =>
        requestAnimationFrame(() => done(canvas.toDataURL("image/png"))),
    );
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = surface.getContext("2d");
    if (!context) throw new Error("no 2d context for the capture");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, surface.width, surface.height);
}

async function pose(camera: number, height: number): Promise<number> {
    Orbit.distance.set(camera, height / Math.sin(Orbit.pitch.get(camera)));
    for (let i = 0; i < 120; i++) {
        await frame();
        if (Math.abs(Transform.pos.y.get(camera) - height) <= height * 1e-3) break;
    }
    await frame();
    await frame();
    return Transform.pos.y.get(camera);
}

// the column band of the image around screen x `cx`, as its own tightly packed RGBA buffer
function column(image: ImageData, cx: number, half: number): { rgba: Uint8ClampedArray; width: number } {
    const x0 = Math.max(0, cx - half);
    const width = Math.min(image.width, cx + half + 1) - x0;
    const rgba = new Uint8ClampedArray(width * image.height * 4);
    for (let y = 0; y < image.height; y++) {
        const from = (y * image.width + x0) * 4;
        rgba.set(image.data.subarray(from, from + width * 4), y * width * 4);
    }
    return { rgba, width };
}

function histogram(image: ImageData): string {
    const counts = new Map<number, number>();
    for (let i = 0; i < image.data.length; i += 4) {
        const key = ((image.data[i] >> 3) << 10) | ((image.data[i + 1] >> 3) << 5) | (image.data[i + 2] >> 3);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 16)
        .map(([k, n]) => `${(k >> 10) << 3},${((k >> 5) & 31) << 3},${(k & 31) << 3}:${n}`)
        .join(" ");
}

/**
 * the classifier bands, over sRGB bytes of the composited frame on the default clear color (which reads
 * under 40 red). Neutral is the gray line family; each axis band excludes the other two axes.
 */
export function gridProbes(width: number, height: number): Record<string, PixelProbe> {
    const quarter = Math.floor(Math.max(width, height) / 4);
    return {
        neutral: {
            name: "neutral",
            minPixels: 2000,
            minSpan: Math.floor(width / 2) + 1,
            r: [40, 96],
            g: [30, 88],
            b: [22, 80],
        },
        axisX: { name: "axisX", minPixels: 100, minSpan: quarter, r: [120, 255], g: [0, 64], b: [0, 64] },
        axisZ: { name: "axisZ", minPixels: 100, minSpan: quarter, r: [16, 96], g: [96, 176], b: [100, 176] },
        axisY: {
            name: "axisY",
            minPixels: 40,
            minSpan: Math.floor(height / 4),
            r: [56, 128],
            g: [112, 192],
            b: [40, 96],
        },
    };
}

const WorldGridHarness: Plugin = {
    name: "WorldGridHarness",
    warm(state: State) {
        const harness = installHarness(state);
        harness.run = async () => {
            const camera = state.only([Orbit]);
            const canvas = document.querySelector("canvas");
            if (camera < 0 || !canvas) return { ok: false, checks: [{ name: "camera and canvas", ok: false }] };
            const checks: Check[] = [];
            for (const height of HEIGHTS) {
                const y = await pose(camera, height);
                const image = await capture(canvas);
                const probes = gridProbes(image.width, image.height);
                // the orbit target is the origin, so it projects to the viewport center
                const strip = column(image, Math.floor(image.width / 2), 6);
                for (const [name, probe] of Object.entries(probes)) {
                    const result =
                        name === "axisY"
                            ? probePixels(strip.rgba, strip.width, image.height, probe)
                            : probePixels(image.data, image.width, image.height, probe);
                    checks.push({
                        name: `${name} at ${height} m`,
                        ok: pixelProbePass(result, probe),
                        detail: `camera y ${y.toFixed(3)}, ${result.pixels} px over ${result.width}x${result.height}; ${histogram(image)}`,
                        data: { ...result, height: y },
                    });
                }
            }
            return { ok: checks.every((c) => c.ok), checks };
        };
    },
};

export default WorldGridHarness;
