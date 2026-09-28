import { Part, Transform } from "@dylanebert/shallot";
import type { State } from "@dylanebert/shallot/ecs";
import { Orbit } from "@dylanebert/shallot/extras";
import {
    CAPTURE_CONTRACT,
    Camera,
    captureFrame,
    computeViewProj,
} from "@dylanebert/shallot/rendering";
import { Compute } from "@dylanebert/shallot/runtime";
import { aim, invert } from "@dylanebert/shallot/utils";
import { Grid } from "@dylanebert/shallot-grid";

export interface WorldGridControl {
    deviceAvailable(): boolean;
    pose(height: number, pitch?: number): Promise<number>;
    capture(): Promise<{ width: number; height: number; rgba: string }>;
    cameraFar(): number;
    setCameraFar(value: number): void;
    cameraFov(): number;
    gridFade(): number;
    setGridFade(value: number): void;
    gridAxisY(): number;
    setGridAxisY(value: number): void;
    gridXray(): number;
    setGridXray(value: number): void;
    box(): { position: number[]; scale: number[]; inverseViewProj: number[] } | null;
}

declare global {
    interface Window {
        worldGridControl?: WorldGridControl;
    }
}

const PITCH = 0.5;
const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

export function exposeWorldGridControl(state: State): void {
    const camera = state.only([Orbit]);
    const grid = state.only([Grid]);
    const canvas = document.querySelector("canvas");
    if (camera < 0 || grid < 0 || !(canvas instanceof HTMLCanvasElement)) {
        throw new Error("world-grid check needs its orbit camera, grid, and canvas");
    }

    window.worldGridControl = {
        deviceAvailable: () => Boolean(Compute.device),
        async pose(height, pitch = PITCH) {
            Orbit.pitch.set(camera, pitch);
            const distance = height / Math.sin(pitch);
            Orbit.distance.set(camera, distance);
            const yaw = Orbit.yaw.get(camera);
            let targetX = Orbit.pan.x.get(camera);
            let targetY = Orbit.pan.y.get(camera);
            let targetZ = Orbit.pan.z.get(camera);
            const target = Orbit.target.get(camera);
            if (target > 0 && state.has(target, Transform)) {
                targetX += Transform.pos.x.get(target);
                targetY += Transform.pos.y.get(target);
                targetZ += Transform.pos.z.get(target);
            }
            const x = targetX + distance * Math.cos(pitch) * Math.sin(yaw);
            const y = targetY + distance * Math.sin(pitch);
            const z = targetZ + distance * Math.cos(pitch) * Math.cos(yaw);
            Transform.pos.set(camera, x, y, z, 0);
            const rotation = aim(x, y, z, targetX, targetY, targetZ);
            Transform.rot.set(camera, rotation.x, rotation.y, rotation.z, rotation.w);
            await frame();
            await frame();
            return Transform.pos.y.get(camera);
        },
        async capture() {
            const image = await captureFrame(canvas);
            let binary = "";
            for (let i = 0; i < image.rgba.length; i += 0x8000) {
                binary += String.fromCharCode(...image.rgba.subarray(i, i + 0x8000));
            }
            return { width: image.width, height: image.height, rgba: btoa(binary) };
        },
        cameraFar: () => Camera.far.get(camera),
        setCameraFar: (value) => Camera.far.set(camera, value),
        cameraFov: () => Camera.fov.get(camera),
        gridFade: () => Grid.fade.get(grid),
        setGridFade: (value) => Grid.fade.set(grid, value),
        gridAxisY: () => Grid.axisY.get(grid),
        setGridAxisY: (value) => Grid.axisY.set(grid, value),
        gridXray: () => Grid.xray.get(grid),
        setGridXray: (value) => Grid.xray.set(grid, value),
        box() {
            const box = [...state.query([Part])].find((eid) => state.has(eid, Transform));
            if (box === undefined) return null;
            const viewProj = new Float32Array(16);
            const inverseViewProj = new Float32Array(16);
            computeViewProj(camera, CAPTURE_CONTRACT.width / CAPTURE_CONTRACT.height, viewProj);
            invert(viewProj, inverseViewProj);
            return {
                position: [
                    Transform.pos.x.get(box),
                    Transform.pos.y.get(box),
                    Transform.pos.z.get(box),
                ],
                scale: [
                    Transform.scale.x.get(box),
                    Transform.scale.y.get(box),
                    Transform.scale.z.get(box),
                ],
                inverseViewProj: Array.from(inverseViewProj),
            };
        },
    };
}
