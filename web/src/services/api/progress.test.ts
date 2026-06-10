import { describe, expect, test } from "bun:test";

import { normalizeGenerationProgress, readGenerationProgress } from "./progress";

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

describe("readGenerationProgress", () => {
    test("reads progress from common upstream response envelopes", () => {
        expect(readGenerationProgress({ progress: 18 })).toBe(18);
        expect(readGenerationProgress({ data: { progress: "42" } })).toBe(42);
        expect(readGenerationProgress({ metadata: { progress_pct: 0.63 } })).toBe(63);
        expect(readGenerationProgress({ result: { percentage: 76.2 } })).toBe(76);
    });
});
