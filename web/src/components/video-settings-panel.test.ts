import { describe, expect, test } from "bun:test";

import { normalizeVideoResolutionValue, normalizeVideoSizeValue, videoResolutionOptions, videoSecondsLabel, videoSizeLabel } from "./video-settings-panel";

describe("video settings panel", () => {
    test("offers 1080p for general video generation settings", () => {
        expect(videoResolutionOptions.map((item) => item.value)).toContain("1080");
        expect(normalizeVideoResolutionValue("1080p")).toBe("1080");
    });

    test("keeps generic size fallbacks and uses the 5-second product default", () => {
        expect(normalizeVideoResolutionValue("")).toBe("1080");
        expect(normalizeVideoSizeValue("")).toBe("720x1280");
        expect(videoSecondsLabel("")).toBe("5s");
        expect(videoSizeLabel("16:9", "480p", "doubao-seedance-2-0-mini-260615")).toBe("16:9（864x496）");
    });
});
