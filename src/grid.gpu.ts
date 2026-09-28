import { expect, test } from "bun:test";
import { GRID_SHADER } from "./shader";

test("the grid shader compiles through Dawn", async () => {
    const bunWebGpuPackage = "bun-webgpu";
    const { setupGlobals } = await import(bunWebGpuPackage);
    await setupGlobals();
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Dawn did not provide a GPU adapter");
    const device = await adapter.requestDevice();
    try {
        const module = device.createShaderModule({ label: "shallot-grid", code: GRID_SHADER });
        const layout = device.createBindGroupLayout({
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
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
        device.pushErrorScope("validation");
        await device.createRenderPipelineAsync({
            layout: pipelineLayout,
            vertex: { module, entryPoint: "vs" },
            fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
            primitive: { topology: "triangle-list" },
        });
        const error = await device.popErrorScope();
        expect(error, error?.message).toBeNull();
    } finally {
        device.destroy();
        (adapter as GPUAdapter & { destroy(): undefined }).destroy();
    }
}, 15_000);
