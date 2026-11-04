import { describe, expect, test } from "bun:test";

import { normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceDurationOptionsForModel, seedanceResolutionOptionsForModel } from "./seedance-video";

describe("Seedance video defaults", () => {
    test("uses vertical 1080p and 10 seconds when values are empty", () => {
        expect(normalizeSeedanceResolution("", "doubao-seedance-2.0")).toBe("1080p");
        expect(normalizeSeedanceResolution("", "doubao-seedance-2.0-fast")).toBe("720p");
        expect(normalizeSeedanceRatio("")).toBe("9:16");
        expect(normalizeSeedanceDuration("")).toBe(10);
    });

    test("uses the dated model capability matrix", () => {
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-0-260128").map((item) => item.value)).toEqual(["480p", "720p", "1080p", "4k"]);
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-0-fast-260128").map((item) => item.value)).toEqual(["480p", "720p"]);
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-0-mini-260615").map((item) => item.value)).toEqual(["480p", "720p"]);
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-5-260628").map((item) => item.value)).toEqual(["480p", "720p", "1080p"]);
        expect(normalizeSeedanceResolution("4K", "doubao-seedance-2-0-260128")).toBe("4k");
        expect(normalizeSeedanceResolution("1080p", "doubao-seedance-2-0-mini-260615")).toBe("720p");
    });

    test("allows 30 seconds only for Seedance 2.5", () => {
        expect(seedanceDurationOptionsForModel("doubao-seedance-2-5-260628")).toContain(30);
        expect(normalizeSeedanceDuration("30", "doubao-seedance-2-5-260628")).toBe(30);
        expect(normalizeSeedanceDuration("30", "doubao-seedance-2-0-260128")).toBe(15);
        expect(normalizeSeedanceDuration("-1", "doubao-seedance-2-0-260128")).toBe(4);
    });
});
