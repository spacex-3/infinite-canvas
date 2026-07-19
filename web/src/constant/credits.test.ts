import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import { requestCreditCost, shouldShowRequestCreditCost } from "./credits";

describe("request credit presentation", () => {
    test("shows configured costs only for cloud channels", () => {
        expect(shouldShowRequestCreditCost("remote")).toBe(true);
        expect(shouldShowRequestCreditCost("local")).toBe(false);
        expect(requestCreditCost({ channelMode: "local", modelCosts: [{ model: "custom", credits: 12 }], model: "custom" })).toBe(0);
    });

    test("gates canvas credit labels by channel mode", () => {
        for (const file of ["canvas-node-prompt-panel.tsx", "canvas-config-node-panel.tsx", "canvas-assistant-panel.tsx"]) {
            const source = readFileSync(resolve(import.meta.dir, `../app/(user)/canvas/components/${file}`), "utf8");
            expect(source).toContain("shouldShowRequestCreditCost(config.channelMode)");
        }
    });
});
