import {
    component,
    f32,
    type Plugin,
    StandardRenderer,
    u32,
    type World,
} from "@dylanebert/shallot";
import {
    Camera,
    CorePipelinePlugin,
    DEPTH_FORMAT,
    DepthPrepassRequests,
    RenderContext,
    RenderPhases,
    SAMPLE_COUNT,
    type View,
} from "@dylanebert/shallot/rendering";
import { draw, setRenderBindGroup, setRenderPipeline } from "@dylanebert/shallot/runtime";
import { color } from "./calculations";
import { shader } from "./shader";

/** One per world; colors are sRGB 0xRRGGBBAA. Alpha 00 hides an axis. */
export const Grid = component(
    "Grid",
    {
        neutral: u32,
        axisX: u32,
        axisY: u32,
        axisZ: u32,
        /** Whole-grid opacity, 0..1. */
        opacity: f32,
        /** Horizon reach in camera heights; zero disables fading. */
        fade: f32,
        /** Fine cells fade in between cells/10 and cells pixels. */
        cells: f32,
        /** Smallest cell size in meters. */
        floor: f32,
        /** Occluded opacity multiplier, 0..1. */
        xray: f32,
    },
    {
        defaults: () => ({
            neutral: 0x504945ff,
            axisX: 0xcc241dff,
            axisY: 0x6b9d65ff,
            axisZ: 0x458588ff,
            opacity: 1,
            fade: 20,
            cells: 40,
            floor: 1,
            xray: 0,
        }),
    },
);

const grids = [Grid];
const stateKey = {
    create: () => ({
        pipelines: new Map<number, GPURenderPipeline>(),
        buffers: new Map<number, GPUBuffer>(),
        data: new Float32Array(24),
    }),
};
function requested(world: World, eid: number): boolean {
    return world.has(eid, StandardRenderer) && world.only(grids) >= 0;
}
function record(world: World, eid: number, view: View, pass: GPURenderPassEncoder): void {
    const grid = world.only(grids);
    if (grid < 0 || !world.has(eid, StandardRenderer) || !view.depth) return;
    const state = world.resource(stateKey);
    const count = world.storage(Camera).antialias.get(eid) ? SAMPLE_COUNT : 1;
    const pipeline = state.pipelines.get(count)!;
    const device = world.gpu.device;
    let buffer = state.buffers.get(eid);
    if (!buffer) {
        buffer = device.createBuffer({
            label: "grid style",
            size: 96,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        state.buffers.set(eid, buffer);
    }
    const style = world.storage(Grid);
    state.data.set(color(style.neutral.get(grid)), 0);
    state.data.set(color(style.axisX.get(grid)), 4);
    state.data.set(color(style.axisY.get(grid)), 8);
    state.data.set(color(style.axisZ.get(grid)), 12);
    state.data.set(
        [
            style.opacity.get(grid),
            style.fade.get(grid),
            style.cells.get(grid),
            style.floor.get(grid),
            style.xray.get(grid),
        ],
        16,
    );
    device.queue.writeBuffer(buffer, 0, state.data);
    const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: world.resource(RenderContext).viewBuffers[view.slot] },
            },
            { binding: 1, resource: { buffer } },
            { binding: 2, resource: view.depth },
        ],
    });
    setRenderPipeline(pass, pipeline);
    setRenderBindGroup(pass, 0, group);
    draw(pass, 3);
}

/** Draws the world's Grid in every StandardRenderer camera, between opaque and transparent draws. */
export const GridPlugin: Plugin = {
    name: "Grid",
    gpu: {},
    dependencies: [CorePipelinePlugin],
    components: [Grid],
    initialize(world) {
        world.resource(RenderPhases).push({ afterOpaque: record });
        world.resource(DepthPrepassRequests).push(requested);
    },
    async warm(world) {
        const device = world.gpu.device;
        const state = world.resource(stateKey);
        for (const count of [1, SAMPLE_COUNT]) {
            const module = device.createShaderModule({ label: "grid", code: shader(count > 1) });
            state.pipelines.set(
                count,
                await device.createRenderPipelineAsync({
                    label: "grid",
                    layout: "auto",
                    vertex: { module, entryPoint: "vertex" },
                    fragment: {
                        module,
                        entryPoint: "fragment",
                        targets: [
                            {
                                format: world.resource(RenderContext).format,
                                blend: {
                                    color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
                                    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
                                },
                            },
                        ],
                    },
                    depthStencil: {
                        format: DEPTH_FORMAT,
                        depthWriteEnabled: false,
                        depthCompare: "always",
                    },
                    multisample: { count },
                }),
            );
        }
    },
    dispose(world) {
        const state = world.resource(stateKey);
        for (const buffer of state.buffers.values()) buffer.destroy();
        state.buffers.clear();
        state.pipelines.clear();
    },
};
