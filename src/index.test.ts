import { expect } from "bun:test";
import { check } from "@dylanebert/shallot/harness/check";
import { GridPlugin } from "./index";

check(
    "grid: plugin structure",
    { claim: "GridPlugin exports the required plugin interface" },
    () => {
        expect(GridPlugin).toBeDefined();
        expect(GridPlugin.name).toBe("Grid");
        expect(GridPlugin.initialize).toBeDefined();
        expect(GridPlugin.warm).toBeDefined();
        expect(GridPlugin.dispose).toBeDefined();
    },
);
