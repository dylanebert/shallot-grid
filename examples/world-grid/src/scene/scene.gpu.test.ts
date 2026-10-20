import { expect, setDefaultTimeout, test } from "bun:test";
import { Camera, DirectionalLight, GlobalAmbientLight, Transform } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { Scene, ScenePlugin } from "./index";

setDefaultTimeout(TIMEOUT.gpu);
test("minimal's sun, ambient, turning cube and ground retain the extended orbit range", async () => {
    const app = await openGpuApp({ defaults: false, plugins: [ScenePlugin] });
    try {
        const { box, camera, ground, sun } = app.world.resource(Scene);
        const ambient = app.world.resource(GlobalAmbientLight);
        expect(ambient.color).toBe(0xd8e4ff);
        expect(ambient.brightness).toBe(380);
        const light = app.world.storage(DirectionalLight);
        expect(light.color.get(sun)).toBe(0xffe8cc);
        expect(light.illuminance.get(sun)).toBe(6000);
        expect(light.shadowMapsEnabled.get(sun)).toBe(1);
        const transform = app.world.storage(Transform);
        expect(transform.translation.x.get(box)).toBe(0);
        expect(transform.translation.y.get(box)).toBe(0);
        expect(transform.translation.z.get(box)).toBe(0);
        expect(transform.translation.y.get(ground)).toBeCloseTo(-0.6);
        expect(transform.scale.x.get(ground)).toBe(4);
        expect(transform.scale.y.get(ground)).toBeCloseTo(0.2);
        expect(transform.scale.z.get(ground)).toBe(4);
        const before = transform.rotation.y.get(box);
        app.world.step(1 / 60);
        expect(transform.rotation.y.get(box)).toBeCloseTo(Math.sin(0.65 / 120) + before);
        const orbit = app.world.storage(Orbit);
        expect(orbit.distance.get(camera)).toBe(6);
        expect(orbit.yaw.get(camera)).toBeCloseTo(0.7);
        expect(orbit.pitch.get(camera)).toBeCloseTo(0.4);
        expect(orbit.minDistance.get(camera)).toBeCloseTo(0.2);
        expect(orbit.maxDistance.get(camera)).toBe(10000);
        expect(app.world.storage(Camera).far.get(camera)).toBe(100000);
    } finally {
        app.dispose();
    }
});
