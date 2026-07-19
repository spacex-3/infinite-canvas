import { describe, expect, test } from "bun:test";

import { normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution } from "./seedance-video";

describe("Seedance video defaults", () => {
    test("uses vertical 1080p and 10 seconds when values are empty", () => {
        expect(normalizeSeedanceResolution("", "doubao-seedance-2.0")).toBe("1080p");
        expect(normalizeSeedanceResolution("", "doubao-seedance-2.0-fast")).toBe("720p");
        expect(normalizeSeedanceRatio("")).toBe("9:16");
        expect(normalizeSeedanceDuration("")).toBe(10);
    });
});
