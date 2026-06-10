import { describe, expect, test } from "bun:test";

import { normalizeGenerationProgress } from "./progress";

describe("normalizeGenerationProgress", () => {
    test("normalizes upstream progress values to whole percentages", () => {
        expect(normalizeGenerationProgress(18.4)).toBe(18);
        expect(normalizeGenerationProgress("62.6")).toBe(63);
        expect(normalizeGenerationProgress(0.75)).toBe(75);
    });

    test("ignores invalid progress values", () => {
        expect(normalizeGenerationProgress(undefined)).toBeUndefined();
        expect(normalizeGenerationProgress("pending")).toBeUndefined();
    });
});
