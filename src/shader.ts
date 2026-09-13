// The world grid shader: one fullscreen ray-plane pass over the y=0 plane plus the vertical Y axis.
//
// Decade blend. The plane point's screen footprint is `f = max(fwidth(p.x), fwidth(p.z))`, metres per
// pixel. With the cells constant `k`, `l = log10(f * k)` names the decade: the finer level's cell is
// `10^floor(l)` metres and spans between k/10 and k pixels, the coarser level's is `10^(floor(l)+1)`
// and spans between k and 10k pixels. Both draw with Ben Golus's pristine line primitive (PlayCanvas
// `scripts/esm/grid.mjs`, `pristineGrid`) at a constant screen width, so a level whose cells approach
// pixel size resolves to its mean coverage instead of moiré. The finer level is weighted
// `1 - fract(l)` and the coarser level at full weight, combined with `max`. Every coarse line is also
// a fine line, so as `fract(l)` reaches 1 the fine level has faded to nothing and the coarse level
// alone remains, and at the next decade that coarse level becomes the fine level at weight 1. Nothing
// pops, and no zoom runs out of levels.
//
// View-relative fade. The footprint already fades the fine level. The plane also fades toward the
// horizon by `1 - smoothstep(0, fade * h, dist)`, where `h` is the camera's height above the plane and
// `dist` the camera's distance to the plane point. Both scale together with zoom, so the grid looks
// the same at 0.5 m and at 5000 m; `fade: 0` turns the horizon fade off.
//
// Y axis. The line x=z=0 is not on the plane, so the fragment finds the ray's closest approach to it,
// draws it at the plane axes' screen width from the derivative of its signed lateral distance, and
// takes the nearer of plane and axis depth. It is the one element that draws when the ray misses the
// plane.
//
// Depth is reverse-Z (near 1, far 0): the pass tests `greater-equal` with depth writes off and writes
// the winning element's depth through `frag_depth`.

/** f32 lane offsets of the `Grid` uniform, as the WGSL struct below lays it out. */
export const GRID_AT = {
    viewProj: 0,
    invViewProj: 16,
    camPos: 32,
    neutral: 36,
    axisX: 40,
    axisY: 44,
    axisZ: 48,
    params: 52,
} as const;

/** byte size of the `Grid` uniform. */
export const GRID_BYTES = 224;
/** `Grid` uniform size in f32 lanes. */
export const GRID_FLOATS = GRID_BYTES / 4;

export const GRID_SHADER = /* wgsl */ `
struct Grid {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    camPos: vec4<f32>,
    neutral: vec4<f32>,
    axisX: vec4<f32>,
    axisY: vec4<f32>,
    axisZ: vec4<f32>,
    params: vec4<f32>,
}

@group(0) @binding(0) var<uniform> grid: Grid;

const LINE_PX: f32 = 1.0;
const AXIS_PX: f32 = 2.0;
const INV_LN10: f32 = 0.4342944819;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) nearPoint: vec3<f32>,
    @location(1) farPoint: vec3<f32>,
}

fn unproject(p: vec3<f32>) -> vec3<f32> {
    let u = grid.invViewProj * vec4(p, 1.0);
    return u.xyz / u.w;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
    let pos = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
        vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
    );
    let p = pos[vi];
    var out: VSOut;
    out.position = vec4(p, 0.0, 1.0);
    // reverse-Z: clip z 1 is the near plane, 0 the far plane
    out.nearPoint = unproject(vec3(p, 1.0));
    out.farPoint = unproject(vec3(p, 0.0));
    return out;
}

struct FragOut {
    @builtin(frag_depth) depth: f32,
    @location(0) color: vec4<f32>,
}

// Ben Golus's pristine grid for thin lines: uv in cells, deriv the per-axis cell footprint of one pixel,
// width the line width in cells. Coverage fades to the line's mean coverage as cells shrink under a pixel.
fn pristine(uv: vec2<f32>, deriv: vec2<f32>, width: vec2<f32>) -> f32 {
    let goal = min(width, vec2(0.5));
    let drawWidth = clamp(goal, deriv, vec2(0.5));
    let aa = deriv * 1.5;
    let g = 1.0 - abs(fract(uv) * 2.0 - 1.0);
    var g2 = 1.0 - smoothstep(drawWidth - aa, drawWidth + aa, g);
    g2 = g2 * saturate(goal / drawWidth);
    g2 = mix(g2, goal, saturate(deriv * 2.0 - 1.0));
    return mix(g2.x, 1.0, g2.y);
}

fn axisCoverage(px: f32) -> f32 {
    return saturate(AXIS_PX * 0.5 + 0.5 - px);
}

fn depthOf(p: vec3<f32>) -> f32 {
    let clip = grid.viewProj * vec4(p, 1.0);
    if (clip.w <= 0.0) { return -1.0; }
    return clip.z / clip.w;
}

fn over(front: vec4<f32>, back: vec4<f32>) -> vec4<f32> {
    let a = front.a + back.a * (1.0 - front.a);
    if (a <= 0.0) { return vec4(0.0); }
    let rgb = (front.rgb * front.a + back.rgb * back.a * (1.0 - front.a)) / a;
    return vec4(rgb, a);
}

@fragment
fn fs(input: VSOut) -> FragOut {
    let opacity = grid.params.x;
    let fade = grid.params.y;
    let cells = max(grid.params.z, 1e-3);

    let origin = input.nearPoint;
    let ray = input.farPoint - input.nearPoint;

    // plane point; derivatives stay in uniform control flow
    let t = -origin.y / ray.y;
    let p = origin + t * ray;
    let dx = dpdx(p.xz);
    let dy = dpdy(p.xz);
    let deriv = vec2(length(vec2(dx.x, dy.x)), length(vec2(dx.y, dy.y)));
    let f = max(fwidth(p.x), fwidth(p.z));

    // Y axis: closest approach of the ray to x=z=0, measured in the xz plane
    let rayXZ = ray.xz;
    let flatLen2 = dot(rayXZ, rayXZ);
    let s = select(0.0, max(-dot(origin.xz, rayXZ) / max(flatLen2, 1e-12), 0.0), flatLen2 > 1e-12);
    let q = origin + s * ray;
    let side = vec2(-rayXZ.y, rayXZ.x) / sqrt(max(flatLen2, 1e-24));
    let lateral = dot(origin.xz, side);
    let lateralPx = abs(lateral) / max(fwidth(lateral), 1e-12);

    var plane = vec4(0.0);
    var planeDepth = -1.0;
    let hit = t > 0.0 && abs(ray.y) > 1e-12;
    if (hit) {
        planeDepth = depthOf(p);
    }
    if (hit && planeDepth >= 0.0 && planeDepth <= 1.0) {
        let l = log(f * cells) * INV_LN10;
        let fine = pow(10.0, floor(l));
        let coarse = fine * 10.0;
        let fineWeight = 1.0 - fract(l);
        let gFine = pristine(p.xz / fine, deriv / fine, deriv * LINE_PX / fine);
        let gCoarse = pristine(p.xz / coarse, deriv / coarse, deriv * LINE_PX / coarse);
        var alpha = max(gCoarse, gFine * fineWeight) * grid.neutral.a;
        var color = grid.neutral.rgb;

        let xCov = axisCoverage(abs(p.z) / max(deriv.y, 1e-12)) * grid.axisX.a;
        let zCov = axisCoverage(abs(p.x) / max(deriv.x, 1e-12)) * grid.axisZ.a;
        color = mix(color, grid.axisX.rgb, xCov);
        alpha = max(alpha, xCov);
        color = mix(color, grid.axisZ.rgb, zCov * (1.0 - xCov));
        alpha = max(alpha, zCov);

        if (fade > 0.0) {
            let h = abs(grid.camPos.y);
            let dist = length(p - grid.camPos.xyz);
            alpha = alpha * (1.0 - smoothstep(0.0, fade * h, dist));
        }
        plane = vec4(color, alpha);
    } else {
        planeDepth = -1.0;
    }

    var axis = vec4(0.0);
    var axisDepth = -1.0;
    if (flatLen2 > 1e-12) {
        axisDepth = depthOf(vec3(0.0, q.y, 0.0));
        if (axisDepth >= 0.0 && axisDepth <= 1.0) {
            axis = vec4(grid.axisY.rgb, axisCoverage(lateralPx) * grid.axisY.a);
        } else {
            axisDepth = -1.0;
        }
    }

    var color: vec4<f32>;
    var depth: f32;
    if (axis.a > 0.0 && axisDepth >= planeDepth) {
        color = over(axis, plane);
        depth = axisDepth;
    } else if (plane.a > 0.0) {
        color = over(plane, axis);
        depth = planeDepth;
    } else {
        discard;
    }
    color.a = color.a * opacity;
    if (color.a < 1.0 / 255.0) { discard; }

    var out: FragOut;
    out.depth = depth;
    out.color = color;
    return out;
}
`;
