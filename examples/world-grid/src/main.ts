import project from "virtual:project";
import { BrowserInputPlugin } from "@dylanebert/shallot";
import { run } from "@dylanebert/shallot/app";
import { GridWorld } from "./world";

const app = await run({
    plugins: [BrowserInputPlugin, ...project.plugins, GridWorld],
    defaults: false,
    capacity: project.capacity ?? undefined,
    pixelRatio: project.pixelRatio ?? undefined,
});

if (new URLSearchParams(location.search).has("check")) {
    const { exposeWorldGridControl } = await import("./check-controller");
    exposeWorldGridControl(app.state);
}
