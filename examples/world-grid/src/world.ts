import {
    Camera,
    Color,
    DepthPrepass,
    MeshInstance,
    Orbit,
    type Plugin,
    StandardRenderer,
    Transform,
} from "@dylanebert/shallot";
import { Grid } from "@dylanebert/shallot-grid";

export const GridWorld: Plugin = {
    name: "GridWorld",
    initialize(world) {
        const grid = world.create();
        world.add(grid, Grid);
        const box = world.create();
        world.add(box, MeshInstance);
        world.add(box, Transform, { translation: [-1.5, 0.75, 1.5, 0] });
        world.add(box, Color, { rgba: [0.95, 0.55, 0.2, 1] });
        const camera = world.create();
        world.add(camera, Camera, { far: 100000 });
        world.add(camera, StandardRenderer);
        world.add(camera, DepthPrepass);
        world.add(camera, Orbit, {
            distance: 10,
            yaw: 0.785,
            pitch: 0.5,
            maxDistance: 20000,
            smoothness: 1,
        });
        world.add(camera, Transform);
    },
};
