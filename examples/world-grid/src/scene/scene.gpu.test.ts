import { expect, setDefaultTimeout, test } from "bun:test";
import { Transform } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { Scene, ScenePlugin } from "./index";

setDefaultTimeout(TIMEOUT.gpu);
test("the scene places a unit box on the plane and permits sub-metre to kilometre orbit", async () => {
    const app = await openGpuApp({ defaults: false, plugins: [ScenePlugin] });
    try {
        const { box, camera } = app.world.resource(Scene);
        expect(app.world.storage(Transform).translation.y.get(box)).toBe(0.5);
        const orbit = app.world.storage(Orbit);
        expect(orbit.minDistance.get(camera)).toBeLessThan(1);
        expect(orbit.maxDistance.get(camera)).toBeGreaterThan(1000);
    } finally {
        app.dispose();
    }
});
