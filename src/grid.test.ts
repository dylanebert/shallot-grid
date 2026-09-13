import { srgbToLinear } from "@dylanebert/shallot";
import { check } from "@dylanebert/shallot/harness/check";
import { GRID_DEFAULTS, type GridStyle, packGrid } from "./index";
import { GRID_AT, GRID_BYTES, GRID_FLOATS, GRID_SHADER } from "./shader";

const COLORS = ["neutral", "axisX", "axisY", "axisZ"] as const;

const DEFAULT_BYTES: Record<(typeof COLORS)[number], number> = {
    neutral: 0x504945,
    axisX: 0xcc241d,
    axisY: 0x6b9d65,
    axisZ: 0x458588,
};

function packed(style: GridStyle): Float32Array {
    const out = new Float32Array(GRID_FLOATS);
    packGrid(style, out);
    return out;
}

check(
    "grid: default colors decode from sRGB bytes to linear",
    { claim: "the grid hands sRGB byte fractions to the linear scene target" },
    () => {
        const out = packed(GRID_DEFAULTS);
        for (const name of COLORS) {
            const rgb = DEFAULT_BYTES[name];
            const bytes = [16, 8, 0].map((shift) => ((rgb >> shift) & 0xff) / 255);
            const got = Array.from(out.subarray(GRID_AT[name], GRID_AT[name] + 4));
            const want = [...bytes.map((b) => Math.fround(srgbToLinear(b))), 1];
            if (want.some((w, i) => got[i] !== w)) {
                throw new Error(
                    `grid ${name}: ${JSON.stringify(got)} is not ${JSON.stringify(want)}`,
                );
            }
            if (bytes.every((b, i) => got[i] === Math.fround(b))) {
                throw new Error(`grid ${name}: packed the raw sRGB fraction`);
            }
        }
    },
);

// WGSL uniform layout rules for the member types the Grid struct uses (WGSL §memory layout).
const WGSL_TYPES: Record<string, { size: number; align: number }> = {
    f32: { size: 4, align: 4 },
    "vec3<f32>": { size: 12, align: 16 },
    "vec4<f32>": { size: 16, align: 16 },
    "mat4x4<f32>": { size: 64, align: 16 },
};

function declaredLayout(source: string, struct: string) {
    const body = source.match(new RegExp(`struct ${struct} \\{([^}]*)\\}`))?.[1];
    if (!body) throw new Error(`shader declares no struct ${struct}`);
    const members = [...body.matchAll(/(\w+)\s*:\s*([\w<>]+)\s*,/g)].map(([, name, type]) => {
        const layout = type && WGSL_TYPES[type];
        if (!name || !layout) throw new Error(`unknown WGSL member type ${type}`);
        return { name, ...layout };
    });
    let offset = 0;
    let align = 0;
    const offsets: Record<string, number> = {};
    for (const m of members) {
        offset = Math.ceil(offset / m.align) * m.align;
        offsets[m.name] = offset;
        offset += m.size;
        align = Math.max(align, m.align);
    }
    return { offsets, size: Math.ceil(offset / align) * align };
}

check(
    "grid: packed uniform matches the shader's struct layout",
    { claim: "the grid packer writes lanes the shader's Grid struct does not declare there" },
    () => {
        const { offsets, size } = declaredLayout(GRID_SHADER, "Grid");
        if (size !== GRID_BYTES)
            throw new Error(`Grid struct is ${size} bytes, packer allocates ${GRID_BYTES}`);
        const names = Object.keys(offsets).sort();
        const packedNames = Object.keys(GRID_AT).sort();
        if (JSON.stringify(names) !== JSON.stringify(packedNames)) {
            throw new Error(`Grid members ${names} differ from packed lanes ${packedNames}`);
        }
        for (const [name, bytes] of Object.entries(offsets)) {
            const lane = GRID_AT[name as keyof typeof GRID_AT];
            if (lane * 4 !== bytes)
                throw new Error(`Grid.${name} at byte ${bytes}, packed at ${lane * 4}`);
        }
    },
);

check(
    "grid: an axis with alpha 0 packs hidden",
    { claim: "an axis alpha of 0 still draws the axis" },
    () => {
        for (const name of ["axisX", "axisY", "axisZ"] as const) {
            const style = { ...GRID_DEFAULTS, [name]: DEFAULT_BYTES[name] << 8 };
            const out = packed(style);
            if (out[GRID_AT[name] + 3] !== 0)
                throw new Error(`hidden ${name} packs alpha ${out[GRID_AT[name] + 3]}`);
            for (const other of COLORS) {
                if (other !== name && out[GRID_AT[other] + 3] !== 1) {
                    throw new Error(
                        `hiding ${name} changed ${other} alpha to ${out[GRID_AT[other] + 3]}`,
                    );
                }
            }
        }
    },
);

check(
    "grid: floor defaults to a metre and packs at its declared lane",
    { claim: "the default grid draws decades finer than a metre" },
    () => {
        if (GRID_DEFAULTS.floor !== 1) throw new Error(`floor defaults to ${GRID_DEFAULTS.floor}`);
        const { offsets } = declaredLayout(GRID_SHADER, "Grid");
        if (offsets.floor !== GRID_AT.floor * 4)
            throw new Error(
                `Grid.floor declared at byte ${offsets.floor}, packed at ${GRID_AT.floor * 4}`,
            );
        const got = packed({ ...GRID_DEFAULTS, floor: 0.25 })[GRID_AT.floor];
        if (packed(GRID_DEFAULTS)[GRID_AT.floor] !== 1 || got !== 0.25)
            throw new Error(`floor packs ${packed(GRID_DEFAULTS)[GRID_AT.floor]} and ${got}`);
    },
);
