import { expect, setDefaultTimeout, test } from "bun:test";
import {
    AlphaMode,
    Camera,
    cube,
    Materials,
    Meshes,
    MeshInstance,
    MeshMaterial,
    StandardMaterial,
    StandardRenderer,
    Tonemapping,
    TonemappingMethod,
    Transform,
    type World,
} from "@dylanebert/shallot";
import { attachTexture, captureTexture, worldToViewport } from "@dylanebert/shallot/rendering";
import { MeshRenderPlugin, StandardRenderingPlugin } from "@dylanebert/shallot/standard/rendering";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { Grid, GridPlugin } from "../src";

setDefaultTimeout(TIMEOUT.gpu);

async function scene(antialias: number) {
    let camera = 0;
    let grid = 0;
    const app = await openGpuApp({
        defaults: false,
        plugins: [
            StandardRenderingPlugin,
            MeshRenderPlugin,
            GridPlugin,
            {
                name: "Scene",
                gpu: { features: ["indirect-first-instance"] },
                dependencies: [StandardRenderingPlugin, MeshRenderPlugin, GridPlugin],
                initialize(world: World) {
                    camera = world.create();
                    world.add(camera, Transform, {
                        translation: [4, 4, 6],
                        rotation: [-0.25, 0.27, 0.07, 0.927],
                    });
                    world.add(camera, Camera, { antialias, clearColor: 0x000000 });
                    world.add(camera, StandardRenderer);
                    world.add(camera, Tonemapping, { method: TonemappingMethod.None });
                    attachTexture(world, camera, { width: 128, height: 128 });
                    grid = world.create();
                    world.add(grid, Grid, {
                        neutral: 0xffffff00,
                        axisX: 0xff0000ff,
                        axisY: 0x00ff00ff,
                        axisZ: 0x0000ffff,
                        fade: 0,
                    });
                },
            },
        ],
    });
    async function pixels() {
        app.world.step(0);
        app.world.step(0);
        return (await captureTexture(app.world, camera)).rgba;
    }
    return { app, camera, grid, pixels };
}
function planeOnly(s: Awaited<ReturnType<typeof scene>>) {
    const storage = s.app.world.storage(Grid);
    for (const field of ["axisX", "axisY", "axisZ"] as const) storage[field].set(s.grid, 0);
    storage.neutral.set(s.grid, 0xffffffff);
}
function top(s: Awaited<ReturnType<typeof scene>>, height = 4) {
    const storage = s.app.world.storage(Transform);
    storage.translation.set(s.camera, 0.23, height, 0.37);
    storage.rotation.set(s.camera, -Math.SQRT1_2, 0, 0, Math.SQRT1_2);
}
// White over black: decoded linear red sums the grid's pixel coverage.
function energy(p: Uint8ClampedArray, x0 = 0, y0 = 0, x1 = 128, y1 = 128) {
    let sum = 0;
    for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
            const v = p[(y * 128 + x) * 4] / 255;
            sum += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        }
    return sum;
}
function object(s: Awaited<ReturnType<typeof scene>>, transparent = false) {
    const world = s.app.world;
    const mesh = world.resource(Meshes).add({
        name: "occluder",
        ...(transparent
            ? {
                  vertices: new Float32Array([
                      -2, 0, -2, 0, 0, 0, 1, 0, -2, 0, 2, 0, 0, 0, 1, 1, 2, 0, 2, 1, 0, 0, 1, 1, 2,
                      0, -2, 1, 0, 0, 1, 0,
                  ]),
                  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
              }
            : cube([2, 1, 2])),
    });
    const material = world.resource(Materials).add(
        StandardMaterial({
            baseColor: transparent ? [0, 0, 1, 0.5] : [0, 0, 0, 1],
            unlit: true,
        }),
        { alphaMode: transparent ? AlphaMode.Blend : AlphaMode.Opaque },
    );
    const eid = world.create();
    world.add(eid, Transform, { translation: [0, transparent ? 0.1 : 0.5, 0] });
    world.add(eid, MeshInstance, { mesh });
    world.add(eid, MeshMaterial, material);
    return eid;
}
for (const aa of [0, 1]) {
    test(
        `axes draw distinct colours and alpha 00 hides each (antialias ${aa})`,
        async () => {
            const s = await scene(aa);
            try {
                const pixels = await s.pixels();
                for (let channel = 0; channel < 3; channel++) {
                    const count = (p: Uint8ClampedArray) =>
                        Array.from({ length: p.length / 4 }, (_, i) => i * 4).filter(
                            (i) =>
                                p[i + channel] > 60 &&
                                p[i + ((channel + 1) % 3)] < 10 &&
                                p[i + ((channel + 2) % 3)] < 10,
                        ).length;
                    expect(count(pixels)).toBeGreaterThan(10);
                    const point = [
                        [2, 0, 0],
                        [0, 2, 0],
                        [0, 0, 2],
                    ][channel] as [number, number, number];
                    const projected = worldToViewport(s.app.world, s.camera, point)!;
                    expect(projected).not.toBeNull();
                    const [x, y] = projected.map(Math.round);
                    let peak = 0;
                    for (let dy = -2; dy <= 2; dy++)
                        for (let dx = -2; dx <= 2; dx++) {
                            peak = Math.max(peak, pixels[((y + dy) * 128 + x + dx) * 4 + channel]);
                        }
                    expect(peak).toBeGreaterThan(100);
                    const field = ["axisX", "axisY", "axisZ"][channel] as
                        | "axisX"
                        | "axisY"
                        | "axisZ";
                    const storage = s.app.world.storage(Grid)[field];
                    const old = storage.get(s.grid);
                    storage.set(s.grid, old & 0xffffff00);
                    expect(count(await s.pixels())).toBe(0);
                    storage.set(s.grid, old);
                }
            } finally {
                s.app.dispose();
            }
        },
        TIMEOUT.startup,
    );
    test(
        `zoom crosses a decade without a coverage jump (antialias ${aa})`,
        async () => {
            const s = await scene(aa);
            try {
                planeOnly(s);
                s.app.world.storage(Grid).floor.set(s.grid, 0.001);
                let previous = 0;
                // At this height a one-metre cell spans 40 pixels: the .1 -> 1 decade boundary.
                for (let i = 0; i <= 40; i++) {
                    const height = (128 / (80 * Math.tan(Math.PI / 6))) * (0.9 + i * 0.005);
                    top(s, height);
                    const current = energy(await s.pixels());
                    expect(current).toBeGreaterThan(30);
                    if (previous) expect(Math.abs(current / previous - 1)).toBeLessThan(0.09);
                    previous = current;
                }
            } finally {
                s.app.dispose();
            }
        },
        TIMEOUT.startup,
    );
    test(
        `horizon fade loses distant coverage; fade zero retains it (antialias ${aa})`,
        async () => {
            const s = await scene(aa);
            try {
                planeOnly(s);
                s.app.world.storage(Transform).translation.set(s.camera, 0.23, 2, 8);
                s.app.world
                    .storage(Transform)
                    .rotation.set(s.camera, -Math.sin(0.15), 0, 0, Math.cos(0.15));
                const unfaded = await s.pixels();
                s.app.world.storage(Grid).fade.set(s.grid, 6);
                const faded = await s.pixels();
                const far = energy(faded, 0, 44, 128, 64) / energy(unfaded, 0, 44, 128, 64);
                const near = energy(faded, 0, 100, 128, 128) / energy(unfaded, 0, 100, 128, 128);
                expect(energy(unfaded, 0, 44, 128, 64)).toBeGreaterThan(10);
                expect(far).toBeLessThan(0.2);
                expect(near).toBeGreaterThan(0.5);
                s.app.world.storage(Grid).fade.set(s.grid, 0);
                expect(await s.pixels()).toEqual(unfaded);
            } finally {
                s.app.dispose();
            }
        },
        TIMEOUT.startup,
    );
    test(
        `box occludes, xray reveals and ghosts (antialias ${aa})`,
        async () => {
            const s = await scene(aa);
            try {
                planeOnly(s);
                top(s);
                const baseline = energy(await s.pixels(), 45, 45, 80, 80);
                expect(baseline).toBeGreaterThan(30);
                object(s);
                const hidden = energy(await s.pixels(), 45, 45, 80, 80);
                s.app.world.storage(Grid).xray.set(s.grid, 0.5);
                const ghost = energy(await s.pixels(), 45, 45, 80, 80);
                s.app.world.storage(Grid).xray.set(s.grid, 1);
                const revealed = energy(await s.pixels(), 45, 45, 80, 80);
                expect(hidden).toBeLessThan(baseline * 0.02);
                expect(ghost / baseline).toBeCloseTo(0.5, 1);
                expect(revealed / baseline).toBeCloseTo(1, 1);
            } finally {
                s.app.dispose();
            }
        },
        TIMEOUT.startup,
    );
    test(
        `transparent quad composites over grid (antialias ${aa})`,
        async () => {
            const s = await scene(aa);
            try {
                planeOnly(s);
                top(s);
                const before = await s.pixels();
                object(s, true);
                const after = await s.pixels();
                const a = energy(before, 40, 40, 88, 88);
                const b = energy(after, 40, 40, 88, 88);
                expect(a).toBeGreaterThan(30);
                expect(b / a).toBeCloseTo(0.5, 1);
                const i = (64 * 128 + 64) * 4;
                expect(after[i + 2]).toBeGreaterThan(180);
            } finally {
                s.app.dispose();
            }
        },
        TIMEOUT.startup,
    );
}
test(
    "disposing one world leaves another drawing independently",
    async () => {
        const a = await scene(0);
        const b = await scene(1);
        try {
            const expected = await b.pixels();
            await a.pixels();
            a.app.dispose();
            expect(await b.pixels()).toEqual(expected);
            b.app.world.storage(Grid).axisX.set(b.grid, 0);
            expect(await b.pixels()).not.toEqual(expected);
        } finally {
            a.app.dispose();
            b.app.dispose();
        }
    },
    TIMEOUT.startup,
);
