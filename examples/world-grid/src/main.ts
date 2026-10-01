import { OrbitPlugin } from "@dylanebert/shallot";
import { run } from "@dylanebert/shallot/app";
import { GridPlugin } from "@dylanebert/shallot-grid";
import { GridWorld } from "./world";

const app = await run({
    plugins: [OrbitPlugin, GridPlugin, GridWorld],
});

if (new URLSearchParams(location.search).has("check")) {
    const { exposeWorldGridControl } = await import("./check-controller");
    exposeWorldGridControl(app.state);
}
