import { Camera, invert, Part, type Plugin, type State, Transform } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import {
    type Check,
    installHarness,
    type PixelProbe,
    pixelProbePass,
    probePixels,
} from "@dylanebert/shallot/harness";
import { type Capture, captureFrame } from "@dylanebert/shallot/harness/capture";
import { computeViewProj } from "@dylanebert/shallot/render";
import { Grid } from "../../../src/index";

// Verification hook for the chromium row in `src/world-grid.test.ts`, not part of the recipe: poses the
// orbit camera at each height, captures the composited canvas, and classifies the frame's grid pixels.
const HEIGHTS = [0.5, 50, 5000];
// the scene's orbit pitch, restored after the frames that change it
const PITCH = 0.5;
// the grazing pitch of the near-fill frame
const GRAZE = 0.1;
// how far along the ground from the origin the floor frame reads line spacing
const FLOOR_REACH = 8;
/**
 * the most of the nearest quarter of the viewport the neutral band may cover at 0.5 m and a grazing pitch.
 * Measured at 1280x720: the 0.1.0 blend, whose finest level draws down to pixel-sized cells with one shared
 * footprint, fills 0.0986 of it; per-direction footprints with the pixel-size fade and a 1 m floor fill
 * 0.0054. The limit sits at half the fused fill and nine times the sparse one.
 */
const NEAR_FILL = 0.05;

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

async function pose(camera: number, height: number, pitch = PITCH): Promise<number> {
    Orbit.pitch.set(camera, pitch);
    Orbit.distance.set(camera, height / Math.sin(pitch));
    let last = Number.NaN;
    for (let i = 0; i < 240; i++) {
        await frame();
        const y = Transform.pos.y.get(camera);
        if (Math.abs(y - height) <= height * 1e-3 && Math.abs(y - last) <= height * 1e-5) break;
        last = y;
    }
    await frame();
    await frame();
    return Transform.pos.y.get(camera);
}

// the column band of the image around screen x `cx`, as its own tightly packed RGBA buffer
function column(
    image: Capture,
    cx: number,
    half: number,
): { rgba: Uint8ClampedArray; width: number } {
    const x0 = Math.max(0, cx - half);
    const width = Math.min(image.width, cx + half + 1) - x0;
    const rgba = new Uint8ClampedArray(width * image.height * 4);
    for (let y = 0; y < image.height; y++) {
        const from = (y * image.width + x0) * 4;
        rgba.set(image.rgba.subarray(from, from + width * 4), y * width * 4);
    }
    return { rgba, width };
}

function histogram(image: Capture): string {
    const counts = new Map<number, number>();
    for (let i = 0; i < image.rgba.length; i += 4) {
        const key =
            ((image.rgba[i] >> 3) << 10) |
            ((image.rgba[i + 1] >> 3) << 5) |
            (image.rgba[i + 2] >> 3);
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
        axisX: {
            name: "axisX",
            minPixels: 100,
            minSpan: quarter,
            r: [120, 255],
            g: [0, 64],
            b: [0, 64],
        },
        axisZ: {
            name: "axisZ",
            minPixels: 100,
            minSpan: quarter,
            r: [16, 96],
            g: [96, 176],
            b: [100, 176],
        },
        axisY: {
            name: "axisY",
            minPixels: 40,
            minSpan: Math.floor(height / 4),
            // the 1 px axis at the viewport's center column splits its coverage across two pixels, reading
            // about (56,104,48); green over 88 excludes neutral (80,73,69) and blue under 88 excludes Z
            r: [32, 100],
            g: [88, 192],
            b: [24, 88],
        },
    };
}

function neutral(image: Capture, i: number, band: PixelProbe): boolean {
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

// the S6 look frames: no fused fill at a grazing near view, lines past the far plane, no decade under a metre
async function lookFrames(
    state: State,
    camera: number,
    canvas: HTMLCanvasElement,
): Promise<Check[]> {
    const checks: Check[] = [];
    const gridEid = state.only([Grid]);
    const fade = Grid.fade.get(gridEid);
    const far = Camera.far.get(camera);
    const tanHalf = Math.tan((Camera.fov.get(camera) * Math.PI) / 360);

    {
        const y = await pose(camera, 0.5, GRAZE);
        const image = await captureFrame(canvas);
        const band = gridProbes(image.width, image.height).neutral;
        const top = Math.floor((image.height * 3) / 4);
        let hits = 0;
        for (let row = top; row < image.height; row++) {
            for (let x = 0; x < image.width; x++)
                if (neutral(image, (row * image.width + x) * 4, band)) hits++;
        }
        const fill = hits / ((image.height - top) * image.width);
        checks.push({
            name: "near quarter unfilled at 0.5 m grazing",
            ok: fill < NEAR_FILL,
            detail: `camera y ${y.toFixed(3)}, pitch ${GRAZE}, neutral fill ${fill.toFixed(4)} of the nearest quarter (limit ${NEAR_FILL})`,
            data: { fill, height: y },
        });
    }

    {
        // with the fade reach past the far plane, only the depth reject could end the plane at the far row
        Camera.far.set(camera, 1000);
        Grid.fade.set(gridEid, 100);
        const y = await pose(camera, 50, PITCH);
        const image = await captureFrame(canvas);
        const band = gridProbes(image.width, image.height).neutral;
        // a ray at ndc y meets the plane at view depth y / (sin p - ndc tan(fov/2) cos p); the far row is depth 1000
        const ndc = (Math.sin(PITCH) - y / 1000) / (tanHalf * Math.cos(PITCH));
        const farRow = Math.floor(((1 - ndc) / 2) * image.height);
        const rows = Math.max(0, farRow - 2);
        const result = probePixels(
            image.rgba.subarray(0, rows * image.width * 4),
            image.width,
            rows,
            band,
        );
        // measured: the 0.1.0 depth reject leaves 0 px above the far row, the clamp 176 px over 326 columns in
        // the band of about 35 rows between the far row and the horizon
        const probe = { ...band, minPixels: 50, minSpan: Math.floor(image.width / 8) };
        checks.push({
            name: "neutral lines past the far plane at 50 m",
            ok: rows > 0 && pixelProbePass(result, probe),
            detail: `camera y ${y.toFixed(3)}, far row ${farRow} of ${image.height}, ${result.pixels} px over ${result.width}x${result.height} above it`,
            data: { ...result, farRow, height: y },
        });
        Camera.far.set(camera, far);
    }

    {
        // fade off so the column reads to the horizon, and the Y axis hidden so the column through the origin
        // shows the plane under it
        const axisY = Grid.axisY.get(gridEid);
        Grid.fade.set(gridEid, 0);
        Grid.axisY.set(gridEid, axisY & ~0xff);
        const y = await pose(camera, 0.2, PITCH);
        const image = await captureFrame(canvas);
        Grid.axisY.set(gridEid, axisY);
        const band = gridProbes(image.width, image.height).neutral;
        const x = Math.floor(image.width / 2);
        // the center column is the ground line through the origin along the view, which at yaw 45 degrees
        // meets 1 m lines only at grid vertices, sqrt(2) m apart; a row's ndc y maps to ground distance from
        // the origin along that line
        const sinP = Math.sin(PITCH);
        const cosP = Math.cos(PITCH);
        const along = (row: number) => {
            const n = (1 - (2 * (row + 0.5)) / image.height) * tanHalf;
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
                neutral(image, (row * image.width + x) * 4, band);
            if (on && start < 0) start = row;
            if (!on && start >= 0) {
                runs.push(along((start + row + 1) / 2));
                start = -1;
            }
        }
        let spacing = Number.POSITIVE_INFINITY;
        for (let i = 1; i < runs.length; i++)
            spacing = Math.min(spacing, (runs[i] ?? 0) - (runs[i - 1] ?? 0));
        checks.push({
            name: "no decade finer than 1 m at 0.2 m",
            ok: runs.length >= 2 && spacing >= Math.SQRT2 * 0.8,
            detail: `camera y ${y.toFixed(3)}, ${runs.length} line runs on column ${x} within ${FLOOR_REACH} m, min spacing ${spacing.toFixed(3)} m, 1 m lines meet it every ${Math.SQRT2.toFixed(3)} m; runs at ${runs.map((r) => r.toFixed(2)).join(",")} m`,
            data: { runs: runs.length, spacing, height: y },
        });
    }

    Grid.fade.set(gridEid, fade);
    return checks;
}

// a band match for any of the named probes at pixel i
function inAny(image: Capture, i: number, bands: PixelProbe[]): boolean {
    return bands.some((band) => neutral(image, i, band));
}

// the Y axis's green hue at any alpha over the dark clear: green leads red and blue
function greenish(image: Capture, i: number): boolean {
    const r = image.rgba[i] ?? 0;
    const g = image.rgba[i + 1] ?? 0;
    const b = image.rgba[i + 2] ?? 0;
    return g >= 48 && g >= r + 16 && g >= b + 16;
}

/**
 * the pixels whose camera ray hits the box shrunk to 80% about its center, so an edge pixel never counts:
 * a CPU ray-box slab test through the camera's inverse view-projection at the capture's aspect.
 */
function boxMask(camera: number, box: number, image: Capture): Uint8Array {
    const viewProj = new Float32Array(16);
    const inv = new Float32Array(16);
    computeViewProj(camera, image.width / image.height, viewProj);
    invert(viewProj, inv);
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    const lanes = ["x", "y", "z"] as const;
    lanes.forEach((axis, k) => {
        const c = Transform.pos[axis].get(box);
        const h = Transform.scale[axis].get(box) * 0.5 * 0.8;
        lo[k] = c - h;
        hi[k] = c + h;
    });
    const unproject = (x: number, y: number, z: number) => {
        const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
        return [0, 1, 2].map(
            (r) => (inv[r] * x + inv[4 + r] * y + inv[8 + r] * z + inv[12 + r]) / w,
        );
    };
    const mask = new Uint8Array(image.width * image.height);
    for (let py = 0; py < image.height; py++) {
        const ny = 1 - (2 * (py + 0.5)) / image.height;
        for (let px = 0; px < image.width; px++) {
            const nx = (2 * (px + 0.5)) / image.width - 1;
            const o = unproject(nx, ny, 1);
            const f = unproject(nx, ny, 0);
            let t0 = 0;
            let t1 = 1;
            for (let k = 0; k < 3 && t0 <= t1; k++) {
                const d = (f[k] ?? 0) - (o[k] ?? 0);
                const ok = o[k] ?? 0;
                if (Math.abs(d) < 1e-12) {
                    if (ok < (lo[k] ?? 0) || ok > (hi[k] ?? 0)) t0 = 2;
                    continue;
                }
                const a = ((lo[k] ?? 0) - ok) / d;
                const b = ((hi[k] ?? 0) - ok) / d;
                t0 = Math.max(t0, Math.min(a, b));
                t1 = Math.min(t1, Math.max(a, b));
            }
            if (t0 <= t1) mask[py * image.width + px] = 1;
        }
    }
    return mask;
}

// the S7 frames: the Y axis unbroken where lines cross it below the ground, and the box hiding the grid
// unless xray draws it through
async function occlusionFrames(
    state: State,
    camera: number,
    canvas: HTMLCanvasElement,
): Promise<Check[]> {
    const checks: Check[] = [];
    const gridEid = state.only([Grid]);

    {
        const y = await pose(camera, 5, PITCH);
        const image = await captureFrame(canvas);
        const probes = gridProbes(image.width, image.height);
        const cx = Math.floor(image.width / 2);
        const cy = Math.floor(image.height / 2);
        // below the origin the column is the Y axis under the ground; the X and Z axes leave it by 12 rows
        let gaps = 0;
        let crossings = 0;
        const gapRows: number[] = [];
        for (let row = cy + 12; row < image.height; row++) {
            let green = false;
            let line = false;
            for (let x = cx - 6; x <= cx + 6; x++) {
                const i = (row * image.width + x) * 4;
                if (greenish(image, i)) green = true;
                if (neutral(image, i, probes.neutral)) line = true;
            }
            if (!green) {
                gaps++;
                if (gapRows.length < 12) gapRows.push(row);
            }
            if (line) crossings++;
        }
        checks.push({
            name: "Y axis unbroken below the ground",
            ok: gaps === 0 && crossings > 0,
            detail: `camera y ${y.toFixed(3)}, rows ${cy + 12}..${image.height - 1} on columns ${cx}±6: ${gaps} rows without the axis (first ${gapRows.join(",")}), ${crossings} rows with a line`,
            data: { gaps, crossings, height: y },
        });
    }

    const box = [...state.query([Part])].find((eid) => state.has(eid, Transform));
    const xray = Grid.xray.get(gridEid);
    for (const value of [0, 1]) {
        Grid.xray.set(gridEid, value);
        const y = await pose(camera, 4, PITCH);
        const image = await captureFrame(canvas);
        const probes = gridProbes(image.width, image.height);
        const mask = box === undefined ? new Uint8Array(0) : boxMask(camera, box, image);
        const inside = mask.reduce((n, m) => n + m, 0);
        const masked = new Uint8ClampedArray(image.rgba.length);
        let hits = 0;
        for (let p = 0; p < mask.length; p++) {
            if (!mask[p]) continue;
            const i = p * 4;
            if (value === 0 && inAny(image, i, Object.values(probes))) hits++;
            masked.set(image.rgba.subarray(i, i + 4), i);
        }
        const boxImage: Capture = { ...image, rgba: masked };
        if (value === 0) {
            checks.push({
                name: "box hides the grid at xray 0",
                ok: inside > 500 && hits === 0,
                detail: `camera y ${y.toFixed(3)}, ${hits} grid-colored px of ${inside} box px; box ${histogram(boxImage)}`,
                data: { hits, inside, height: y },
            });
        } else {
            let x0 = image.width;
            let x1 = -1;
            for (let p = 0; p < mask.length; p++) {
                if (!mask[p]) continue;
                x0 = Math.min(x0, p % image.width);
                x1 = Math.max(x1, p % image.width);
            }
            const result = probePixels(masked, image.width, image.height, probes.neutral);
            const probe = {
                ...probes.neutral,
                minPixels: 20,
                minSpan: Math.max(1, Math.floor((x1 - x0) / 3)),
            };
            checks.push({
                name: "grid lines cross the box at xray 1",
                ok: inside > 500 && pixelProbePass(result, probe),
                detail: `camera y ${y.toFixed(3)}, ${result.pixels} neutral px over ${result.width}x${result.height} within ${inside} box px spanning ${x1 - x0 + 1} columns; box ${histogram(boxImage)}`,
                data: { ...result, inside, height: y },
            });
        }
    }
    Grid.xray.set(gridEid, xray);
    return checks;
}

const WorldGridHarness: Plugin = {
    name: "WorldGridHarness",
    warm(state: State) {
        const harness = installHarness(state);
        harness.run = async () => {
            const camera = state.only([Orbit]);
            const canvas = document.querySelector("canvas");
            if (camera < 0 || !canvas)
                return { ok: false, checks: [{ name: "camera and canvas", ok: false }] };
            const checks: Check[] = [];
            for (const height of HEIGHTS) {
                const y = await pose(camera, height);
                const image = await captureFrame(canvas);
                const probes = gridProbes(image.width, image.height);
                // the orbit target is the origin, so it projects to the viewport center
                const strip = column(image, Math.floor(image.width / 2), 6);
                for (const [name, probe] of Object.entries(probes)) {
                    const result =
                        name === "axisY"
                            ? probePixels(strip.rgba, strip.width, image.height, probe)
                            : probePixels(image.rgba, image.width, image.height, probe);
                    checks.push({
                        name: `${name} at ${height} m`,
                        ok: pixelProbePass(result, probe),
                        detail: `camera y ${y.toFixed(3)}, ${result.pixels} px over ${result.width}x${result.height}; ${histogram(image)}`,
                        data: { ...result, height: y },
                    });
                }
            }
            checks.push(...(await lookFrames(state, camera, canvas)));
            checks.push(...(await occlusionFrames(state, camera, canvas)));
            await pose(camera, HEIGHTS[0] ?? 0.5);
            return { ok: checks.every((c) => c.ok), checks };
        };
    },
};

export default WorldGridHarness;
