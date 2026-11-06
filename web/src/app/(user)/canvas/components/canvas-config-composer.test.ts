import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("canvas config composer references", () => {
    test("renders selected resources as explicit @ reference chips", () => {
        const source = readFileSync(new URL("./canvas-config-composer.tsx", import.meta.url), "utf8");

        expect(source).toContain('text.textContent = `@${resourceLabel(input, inputs)}${roleLabel ? ` · ${roleLabel}` : ""}`');
        expect(source).toContain("background: theme.toolbar.activeBg");
        expect(source).toContain("enableSeedanceImageRoles");
    });
});
