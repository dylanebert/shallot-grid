import {
    Camera,
    GlobalAmbientLight,
    Materials,
    MeshInstance,
    MeshMaterial,
    MeshPlugin,
    type Plugin,
    type Resource,
    StandardMaterial,
    StandardRenderer,
    Transform,
} from "@dylanebert/shallot";
import { Orbit, OrbitPlugin } from "@dylanebert/shallot/extras";
import { Grid, GridPlugin } from "@dylanebert/shallot-grid";

export const Scene: Resource<{ camera: number; box: number; grid: number }> = {
    create: () => ({ camera: 0, box: 0, grid: 0 }),
};

export const ScenePlugin: Plugin = {
    name: "Scene",
    dependencies: [MeshPlugin, OrbitPlugin, GridPlugin],
    initialize(world) {
        world.resource(GlobalAmbientLight).brightness = 500;
        const scene = world.resource(Scene);
        scene.camera = world.create();
        world.add(scene.camera, Camera, { clearColor: 0x191816, far: 100000 });
        world.add(scene.camera, StandardRenderer);
        world.add(scene.camera, Transform);
        world.add(scene.camera, Orbit, {
            distance: 6,
            yaw: 0.7,
            pitch: 0.4,
            minDistance: 0.2,
            maxDistance: 10000,
        });
        scene.box = world.create();
        world.add(scene.box, MeshInstance);
        world.add(
            scene.box,
            MeshMaterial,
            world.resource(Materials).add(
                StandardMaterial({
                    baseColor: [0.35, 0.3, 0.22, 1],
                    perceptualRoughness: 0.8,
                }),
            ),
        );
        world.add(scene.box, Transform, { translation: [1, 0.5, -1] });
        scene.grid = world.create();
        world.add(scene.grid, Grid);
    },
};
