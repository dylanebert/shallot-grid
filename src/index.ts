// Grid: an infinite world grid on the y=0 plane with X, Y and Z axis lines, drawn as one fullscreen
// ray-plane pass after sear's color pass and before glaze. The mechanism is in `./shader`. One `Grid`
// singleton holds the look; the scene tag `<a grid />` is the whole happy path.
import type { Plugin, State, System } from "@dylanebert/shallot";
import {
    Camera,
    Compute,
    f32,
    formatHex,
    invert,
    sparse,
    Transform,
    u32,
    unpackColor,
} from "@dylanebert/shallot";
import { GlazePlugin, GlazeSystem } from "@dylanebert/shallot/glaze";
import {
    computeViewProj,
    Render,
    RenderPlugin,
    type View,
    Views,
} from "@dylanebert/shallot/render";
import { ColorSystem, SearPlugin } from "@dylanebert/shallot/sear";
import { GRID_AT, GRID_BYTES, GRID_FLOATS, GRID_SHADER } from "./shader";

/**
 * the scene's world grid, one per scene (a singleton). Colors are hex sRGB bytes with alpha
 * (0xRRGGBBAA); an axis with alpha 0 is hidden.
 *
 * @example
 * ```
 * <a grid="axis-y: 0x6b9d6500; fade: 40; cells: 48; floor: 0.1" />
 * ```
 */
export const Grid = {
    /** hex sRGB color with alpha of the neutral grid lines (e.g. 0x504945ff) */
    neutral: sparse(u32),
    /** hex sRGB color with alpha of the X axis; alpha 0 hides it */
    axisX: sparse(u32),
    /** hex sRGB color with alpha of the vertical Y axis; alpha 0 hides it */
    axisY: sparse(u32),
    /** hex sRGB color with alpha of the Z axis; alpha 0 hides it */
    axisZ: sparse(u32),
    /** opacity of the whole grid [0,1] */
    opacity: sparse(f32),
    /** horizon fade reach in camera heights: the plane fades out by `fade × height` (0 = off) */
    fade: sparse(f32),
    /** pixels per cell at a decade boundary: the finer level fades in as its cells grow from k/10 to k pixels */
    cells: sparse(f32),
    /** smallest cell in metres: no finer decade draws, and below it this level grows on screen */
    floor: sparse(f32),
    /** how much of the grid draws through scene geometry [0,1]: 0 hides it behind objects, 1 draws it over them */
    xray: sparse(f32),
};

/** the look a `Grid` singleton carries, one number per field. */
export type GridStyle = { [K in keyof typeof Grid]: number };

export const GRID_DEFAULTS: GridStyle = {
    neutral: 0x504945ff,
    axisX: 0xcc241dff,
    axisY: 0x6b9d65ff,
    axisZ: 0x458588ff,
    opacity: 1,
    fade: 20,
    cells: 40,
    floor: 1,
    xray: 0,
};

function packColorAt(rgba: number, out: Float32Array, at: number): void {
    const { r, g, b } = unpackColor(rgba >>> 8);
    out[at] = r;
    out[at + 1] = g;
    out[at + 2] = b;
    out[at + 3] = (rgba & 0xff) / 255;
}

/** pack a grid look into its `Grid` uniform lanes. Colors decode to linear rgb with a 0..1 alpha. */
export function packGrid(style: GridStyle, out: Float32Array): void {
    packColorAt(style.neutral, out, GRID_AT.neutral);
    packColorAt(style.axisX, out, GRID_AT.axisX);
    packColorAt(style.axisY, out, GRID_AT.axisY);
    packColorAt(style.axisZ, out, GRID_AT.axisZ);
    out[GRID_AT.params] = style.opacity;
    out[GRID_AT.params + 1] = style.fade;
    out[GRID_AT.params + 2] = style.cells;
    out[GRID_AT.params + 3] = 0;
    out[GRID_AT.floor] = style.floor;
    out[GRID_AT.xray] = Math.min(1, Math.max(0, style.xray));
}

function readGrid(eid: number): GridStyle {
    return {
        neutral: Grid.neutral.get(eid),
        axisX: Grid.axisX.get(eid),
        axisY: Grid.axisY.get(eid),
        axisZ: Grid.axisZ.get(eid),
        opacity: Grid.opacity.get(eid),
        fade: Grid.fade.get(eid),
        cells: Grid.cells.get(eid),
        floor: Grid.floor.get(eid),
        xray: Grid.xray.get(eid),
    };
}

const ALPHA_BLEND: GPUBlendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
};

const gpu = {
    pipeline: null as GPURenderPipeline | null,
    uniform: null as GPUBuffer | null,
    layout: null as GPUBindGroupLayout | null,
    // per camera: the bind group over its scene depth, rebuilt when sear reallocates that depth
    groups: new Map<number, { depth: GPUTextureView; group: GPUBindGroup }>(),
};

function bindGroupFor(camera: number, depth: GPUTextureView): GPUBindGroup | null {
    if (!gpu.layout || !gpu.uniform) return null;
    const cached = gpu.groups.get(camera);
    if (cached?.depth === depth) return cached.group;
    const group = Compute.device.createBindGroup({
        label: "grid",
        layout: gpu.layout,
        entries: [
            { binding: 0, resource: { buffer: gpu.uniform } },
            { binding: 1, resource: depth },
        ],
    });
    gpu.groups.set(camera, { depth, group });
    return group;
}

const _data = new Float32Array(GRID_FLOATS);
const _viewProj = new Float32Array(16);
const _invViewProj = new Float32Array(16);

function drawGrid(camera: number, view: View): void {
    const device = Compute.device;
    const encoder = Render.encoder;
    if (!device || !encoder || !gpu.pipeline || !gpu.uniform) return;
    if (!view.framebuffer || !view.depth || view.width === 0 || view.height === 0) return;
    const bindGroup = bindGroupFor(camera, view.depth);
    if (!bindGroup) return;

    computeViewProj(camera, view.width / view.height, _viewProj);
    invert(_viewProj, _invViewProj);
    _data.set(_viewProj, GRID_AT.viewProj);
    _data.set(_invViewProj, GRID_AT.invViewProj);
    _data[GRID_AT.camPos] = Transform.pos.x.get(camera);
    _data[GRID_AT.camPos + 1] = Transform.pos.y.get(camera);
    _data[GRID_AT.camPos + 2] = Transform.pos.z.get(camera);
    _data[GRID_AT.camPos + 3] = 1;
    device.queue.writeBuffer(gpu.uniform, 0, _data);

    const pass = encoder.beginRenderPass({
        label: "grid",
        colorAttachments: [{ view: view.framebuffer, loadOp: "load", storeOp: "store" }],
        timestampWrites: Compute.span?.("grid"),
    });
    pass.setPipeline(gpu.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
}

// draws the grid into every camera's view after sear's color pass and before glaze composites it, reading
// the scene depth requested by each camera's declared `Depth` marker. No-op unless the scene has a Grid
// singleton.
const GridSystem: System = {
    name: "grid",
    group: "draw",
    after: [ColorSystem],
    before: [GlazeSystem],
    update(state: State) {
        const eid = state.only([Grid]);
        if (eid < 0) return;
        packGrid(readGrid(eid), _data);
        for (const camera of state.query([Camera])) {
            const view = Views.get(camera);
            if (view) drawGrid(camera, view);
        }
    },
};

/**
 * infinite world grid with X, Y and Z axes. Opt-in: add `GridPlugin` to the plugin set and give the scene
 * one {@link Grid} singleton (`<a grid />`).
 */
export const GridPlugin: Plugin = {
    name: "Grid",
    components: { Grid },
    traits: {
        Grid: {
            singleton: true,
            defaults: () => ({ ...GRID_DEFAULTS }),
            format: {
                neutral: formatHex,
                axisX: formatHex,
                axisY: formatHex,
                axisZ: formatHex,
            },
        },
    },
    systems: [GridSystem],
    dependencies: [RenderPlugin, SearPlugin, GlazePlugin],

    async warm() {
        const device = Compute.device;
        if (!device) return;
        const module = device.createShaderModule({ label: "grid", code: GRID_SHADER });
        const layout = device.createBindGroupLayout({
            label: "grid",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" },
                },
            ],
        });
        gpu.uniform?.destroy();
        gpu.uniform = device.createBuffer({
            label: "grid-uniform",
            size: GRID_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        gpu.layout = layout;
        gpu.groups.clear();
        gpu.pipeline = await device.createRenderPipelineAsync({
            label: "grid",
            layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
            vertex: { module, entryPoint: "vs" },
            fragment: {
                module,
                entryPoint: "fs",
                targets: [{ format: Render.format, blend: ALPHA_BLEND }],
            },
            primitive: { topology: "triangle-list" },
        });
    },

    dispose() {
        gpu.uniform?.destroy();
        gpu.uniform = null;
        gpu.layout = null;
        gpu.groups.clear();
        gpu.pipeline = null;
    },
};

export default GridPlugin;
