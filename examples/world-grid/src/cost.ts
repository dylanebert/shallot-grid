import { type Plugin, type State, Transform } from "@dylanebert/shallot";
import { Orbit, Profile } from "@dylanebert/shallot/extras";
import { installHarness } from "@dylanebert/shallot/harness";

// Verification hook for `tests/frame-cost.oracle.ts`, not part of the recipe: the oracle names it, with
// `"Profile": true`, in a temporary manifest beside this example, so the recipe itself never profiles.
// It poses the camera, lets the profiler settle, and reports the grid pass's mean GPU time per occurrence
// over a window, read from the cumulative counters rather than the display-held `gpu` map.
const HEIGHT = 50;
const WARM_FRAMES = 120;
const WINDOW_FRAMES = 600;

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

const FrameCostHarness: Plugin = {
    name: "FrameCostHarness",
    warm(state: State) {
        const harness = installHarness(state);
        harness.run = async () => {
            const camera = state.only([Orbit]);
            const canvas = document.querySelector("canvas");
            if (camera < 0 || !canvas)
                return { ok: false, checks: [{ name: "camera and canvas", ok: false }] };
            Orbit.distance.set(camera, HEIGHT / Math.sin(Orbit.pitch.get(camera)));
            for (let i = 0; i < WARM_FRAMES; i++) await frame();
            const time0 = Profile.gpuTime.get("grid") ?? 0;
            const fires0 = Profile.gpuFires.get("grid") ?? 0;
            let peak = 0;
            for (let i = 0; i < WINDOW_FRAMES; i++) {
                await frame();
                peak = Math.max(peak, Profile.gpu.get("grid") ?? 0);
            }
            const fires = (Profile.gpuFires.get("grid") ?? 0) - fires0;
            const meanMs =
                fires > 0 ? ((Profile.gpuTime.get("grid") ?? 0) - time0) / fires : Number.NaN;
            return {
                ok: fires > 0,
                checks: [
                    {
                        name: "grid pass GPU time",
                        ok: fires > 0,
                        detail: `mean ${meanMs.toFixed(4)} ms over ${fires} passes, held peak ${peak.toFixed(4)} ms, canvas ${canvas.width}x${canvas.height}; timed passes: ${[...Profile.gpuFires.keys()].join(", ") || "none"}`,
                        data: {
                            meanMs,
                            peakMs: peak,
                            fires,
                            width: canvas.width,
                            height: canvas.height,
                            cameraY: Transform.pos.y.get(camera),
                        },
                    },
                ],
            };
        };
    },
};

export default FrameCostHarness;
