import { expect, setDefaultTimeout, test } from "bun:test";
import { Orbit } from "@dylanebert/shallot/extras";
import { pointerWheel } from "@dylanebert/shallot/input";
import { attachTexture, captureTexture } from "@dylanebert/shallot/rendering";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { Scene, ScenePlugin } from "../src/scene";

setDefaultTimeout(TIMEOUT.node);
test("the composed app draws grid lines and coloured axes while orbit zooms", async () => {
    const app = await openGpuApp({ plugins: [ScenePlugin] });
    try {
        const { camera } = app.world.resource(Scene);
        attachTexture(app.world, camera, { width: 320, height: 180 });
        app.world.step(1 / 60);
        pointerWheel(app.world, 500);
        app.world.step(1 / 60);
        expect(app.world.storage(Orbit).distance.get(camera)).toBeGreaterThan(6);
        for (let i = 0; i < 60; i++) app.world.step(1 / 60);
        const { rgba } = await captureTexture(app.world, camera);
        let lines = 0;
        let axes = 0;
        for (let i = 0; i < rgba.length; i += 4) {
            const r = rgba[i]!;
            const g = rgba[i + 1]!;
            const b = rgba[i + 2]!;
            if (Math.max(r, g, b) - Math.min(r, g, b) < 16 && r > 32) lines++;
            if (r > g * 1.5 || b > r * 1.5 || g > r * 1.5) axes++;
        }
        expect(lines).toBeGreaterThan(100);
        expect(axes).toBeGreaterThan(30);
    } finally {
        app.dispose();
    }
});
