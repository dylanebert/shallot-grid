declare module "virtual:project" {
    import type { Plugin } from "@dylanebert/shallot/app";

    const project: {
        plugins: Plugin[];
        scene?: string;
        capacity?: number;
        pixelRatio?: number | "auto";
    };
    export default project;
}
