import tgpu from "typegpu";
import { decade } from "./calculations";

// Screen-space derivatives keep each direction independent at grazing angles.
// Pristine lines: Ben Golus, The Best Darn Grid Shader (Yet).
// Pixel-sized decade weighting: Blender overlay_grid_frag.glsl.
export function shader(multisampled: boolean): string {
    return (
        tgpu.resolve([decade], { names: "strict" }) +
        /* wgsl */ `
struct Camera {
    clip: mat4x4f,
    resolution: vec2f,
    right: vec4f,
    up: vec4f,
    projection: vec4f,
    eye: vec4f,
    inverse: mat4x4f,
}
struct Style {
    neutral: vec4f,
    x: vec4f,
    y: vec4f,
    z: vec4f,
    // opacity, fade, pixels per cell, finest cell in metres
    grid: vec4f,
    xray: vec4f,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> style: Style;
@group(0) @binding(2) var depth: ${multisampled ? "texture_depth_multisampled_2d" : "texture_depth_2d"};
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let p = array(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
    return vec4f(p[i], 0, 1);
}
fn unproject(uv: vec2f, z: f32) -> vec3f {
    let h = camera.inverse * vec4f(uv, z, 1);
    return h.xyz / h.w;
}
fn line(coordinate: f32, derivative: f32) -> f32 {
    let footprint = max(derivative, 0.0000001);
    let width = clamp(footprint, 0.0, 0.5);
    let distance = 0.5 - abs(fract(coordinate) - 0.5);
    let coverage = (1.0 - smoothstep(width - footprint * 1.5, width + footprint * 1.5, distance * 2.0)) * clamp(footprint / max(width, 1e-10), 0.0, 1.0);
    return mix(coverage, width, clamp(footprint * 2.0 - 1.0, 0.0, 1.0));
}
fn decade(p: f32, footprint: f32) -> f32 {
    let k = max(style.grid.z, 1.0);
    let selected = selectDecade(footprint, k, style.grid.w);
    let cell = selected.cell;
    let weight = selected.weight;
    return max(line(p / cell, footprint / cell) * weight, line(p / (cell * 10.0), footprint / (cell * 10.0)));
}
fn visibility(p: vec3f, scene: f32) -> f32 {
    let clip = camera.clip * vec4f(p, 1);
    if (clip.w <= 0.0 || clip.z > clip.w) { return 0.0; }
    return select(1.0, clamp(style.xray.x, 0.0, 1.0), max(clip.z / clip.w, 0.0) + 1e-6 < scene);
}
// All intermediate colours are premultiplied. The vertical axis is always over the plane.
fn over(a: vec4f, b: vec4f) -> vec4f { return a + b * (1.0 - a.a); }
fn ink(color: vec4f, coverage: f32) -> vec4f {
    let alpha = color.a * coverage * clamp(style.grid.x, 0.0, 1.0);
    return vec4f(color.rgb * alpha, alpha);
}
@fragment fn fragment(@builtin(position) pixel: vec4f${multisampled ? ", @builtin(sample_index) sample: u32" : ""}) -> @location(0) vec4f {
    let uv = vec2f(pixel.x / camera.resolution.x * 2.0 - 1.0, 1.0 - pixel.y / camera.resolution.y * 2.0);
    let start = unproject(uv, 1.0);
    let ray = normalize(unproject(uv, 0.5) - start);
    let t = -start.y / select(ray.y, 1e-10, abs(ray.y) < 1e-10);
    let plane = start + ray * t;
    let footprint = fwidth(plane.xz);
    let lines = max(decade(plane.x, footprint.x), decade(plane.z, footprint.y));
    let axisX = 1.0 - smoothstep(0.0, max(footprint.y, 1e-10), abs(plane.z));
    let axisZ = 1.0 - smoothstep(0.0, max(footprint.x, 1e-10), abs(plane.x));
    let scene = textureLoad(depth, vec2i(pixel.xy), ${multisampled ? "i32(sample)" : "0"});
    var fade = 1.0;
    if (style.grid.y > 0.0) {
        fade = 1.0 - smoothstep(0.0, style.grid.y * max(abs(camera.eye.y), 1e-6), distance(camera.eye.xyz, plane));
    }
    let planeVisible = select(0.0, fade * visibility(plane, scene), t >= 0.0);
    var result = ink(style.neutral, lines);
    result = over(ink(style.x, axisX), result);
    result = over(ink(style.z, axisZ), result) * planeVisible;
    // Closest ray point to the vertical line, with signed lateral distance for derivatives.
    let horizontal = max(dot(ray.xz, ray.xz), 1e-15);
    let axisT = -dot(start.xz, ray.xz) / horizontal;
    let closest = start + ray * axisT;
    let lateral = (start.x * ray.z - start.z * ray.x) / sqrt(horizontal);
    let axisCoverage = 1.0 - smoothstep(0.0, max(fwidth(lateral), 1e-10), abs(lateral));
    let yVisible = select(0.0, visibility(vec3f(0, closest.y, 0), scene), axisT >= 0.0);
    return over(ink(style.y, axisCoverage * yVisible * select(0.5, 1.0, closest.y >= 0.0)), result);
}
`
    );
}
