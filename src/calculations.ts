import { unpackColor } from "@dylanebert/shallot";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

/** Decode sRGB 0xRRGGBBAA into linear RGB and unchanged alpha. */
export function color(rgba: number): number[] {
    const { r, g, b } = unpackColor(rgba >>> 8);
    return [r, g, b, (rgba & 255) / 255];
}

/** Per-direction decade selection, callable on the CPU and resolved into the shader. */
export const decade = tgpu
    .fn(
        [d.f32, d.f32, d.f32],
        d.struct({ cell: d.f32, weight: d.f32 }).$name("GridDecade"),
    )((footprint, cells, minimum) => {
        "use gpu";
        const k = std.max(cells, 1);
        const f = std.max(footprint, 1e-20);
        const cell = std.max(
            std.pow(10, std.floor(std.log2(f * k) / std.log2(10))),
            std.max(minimum, 1e-10),
        );
        return { cell, weight: std.smoothstep(k / 10, k, cell / f) };
    })
    .$name("selectDecade");
