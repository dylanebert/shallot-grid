import { expect, test } from "bun:test";
import { color, decade } from "../src/calculations";

test("packed sRGB decodes to linear RGB without gamma-correcting alpha", () => {
    expect(color(0xff008080)).toEqual([1, 0, expect.closeTo(0.21586, 4), 128 / 255]);
    expect(color(0x12345600)[3]).toBe(0);
});
test("a decade's fine weight rises continuously from cells/10 to cells pixels", () => {
    expect(decade(0.25, 40, 0.001)).toEqual({ cell: 10, weight: 1 });
    expect(decade(2.5 - 1e-5, 40, 0.001).weight).toBeCloseTo(0);
    expect(decade(1 / 22, 40, 1)).toEqual({ cell: 1, weight: expect.closeTo(0.5, 5) });
    expect(decade(0.001, 40, 1)).toEqual({ cell: 1, weight: 1 });
});
