// The world grid shader: one fullscreen ray-plane pass over the y=0 plane plus the vertical Y axis.
//
// Decade blend, per direction. Lines across x (constant x) read their footprint `f = fwidth(p.x)`, metres
// per pixel along x, and lines across z read `fwidth(p.z)`, so a grazing view that stretches one direction
// never fuses the other. With the cells constant `k`, `l = log10(f * k)` names each direction's decade:
// the finer level's cell is `max(10^floor(l), floor)` metres and the coarser level's is ten times that.
// An unfloored finer cell spans between k/10 and k pixels and its coarser cell between k and 10k. Both
// draw with Ben Golus's pristine line primitive (PlayCanvas `scripts/esm/grid.mjs`, `pristineGrid`) at a
// constant screen width. The finer level is weighted by its cell size in pixels,
// `smoothstep(k/10, k, cellPx)`, Blender's `overlay_grid_frag.glsl` shape: at the default `k` of 40 it is
// gone by 4 px and full by 40 px, so no level draws with cells near line width. The coarser level draws
// at full weight, combined with `max`. Every coarse line is also a fine line, so as the fine level's
// cells shrink to k/10 pixels it has faded to nothing, and at the next decade the coarse level, at k
// pixels, becomes the fine level at full weight. Nothing pops, and no zoom runs out of levels.
//
// Floor. The finest decade never drops under `floor` metres: below the zoom where it would, the floored
// level grows on screen at full weight and no finer level appears.
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
// the winning element's depth through `frag_depth`. A grid has no edge of range: a plane or axis point
// beyond the camera's far plane still draws, its depth clamped to the far plane's 0, so the horizon fade
// alone ends the grid. Only a point behind the camera or nearer than the near plane is rejected.

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
    floor: 56,
} as const;

/** byte size of the `Grid` uniform. */
export const GRID_BYTES = 240;
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
    floor: f32,
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

// Ben Golus's pristine grid for thin lines along one direction: u in cells, deriv the cell footprint of one
// pixel, width the line width in cells. Coverage fades to the line's mean coverage as cells shrink under a pixel.
fn pristine(u: f32, deriv: f32, width: f32) -> f32 {
    let goal = min(width, 0.5);
    let drawWidth = clamp(goal, deriv, 0.5);
    let aa = deriv * 1.5;
    let g = 1.0 - abs(fract(u) * 2.0 - 1.0);
    var g2 = 1.0 - smoothstep(drawWidth - aa, drawWidth + aa, g);
    g2 = g2 * saturate(goal / drawWidth);
    return mix(g2, goal, saturate(deriv * 2.0 - 1.0));
}

// one direction's two decade levels: coord the plane coordinate, f its footprint in metres per pixel,
// deriv its anti-aliasing footprint
fn decades(coord: f32, f: f32, deriv: f32, cells: f32, minCell: f32) -> f32 {
    let foot = max(f, 1e-12);
    let l = log(foot * cells) * INV_LN10;
    let fine = max(pow(10.0, floor(l)), minCell);
    let coarse = fine * 10.0;
    let fineWeight = smoothstep(cells * 0.1, cells, fine / foot);
    let gFine = pristine(coord / fine, deriv / fine, deriv * LINE_PX / fine);
    let gCoarse = pristine(coord / coarse, deriv / coarse, deriv * LINE_PX / coarse);
    return max(gCoarse, gFine * fineWeight);
}

fn axisCoverage(px: f32) -> f32 {
    return saturate(AXIS_PX * 0.5 + 0.5 - px);
}

fn depthOf(p: vec3<f32>) -> f32 {
    let clip = grid.viewProj * vec4(p, 1.0);
    if (clip.w <= 0.0) { return -1.0; }
    // past the far plane clamps to the far plane's depth
    return max(clip.z / clip.w, 0.0);
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
    let minCell = max(grid.floor, 0.0);

    let origin = input.nearPoint;
    let ray = input.farPoint - input.nearPoint;

    // plane point; derivatives stay in uniform control flow
    let t = -origin.y / ray.y;
    let p = origin + t * ray;
    let dx = dpdx(p.xz);
    let dy = dpdy(p.xz);
    let deriv = vec2(length(vec2(dx.x, dy.x)), length(vec2(dx.y, dy.y)));
    let fx = fwidth(p.x);
    let fz = fwidth(p.z);

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
        let gx = decades(p.x, fx, deriv.x, cells, minCell);
        let gz = decades(p.z, fz, deriv.y, cells, minCell);
        var alpha = mix(gx, 1.0, gz) * grid.neutral.a;
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
