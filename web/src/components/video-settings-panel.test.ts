import { describe, expect, test } from "bun:test";

import { normalizeVideoResolutionValue, normalizeVideoSizeValue, videoResolutionOptions, videoSecondsLabel } from "./video-settings-panel";

describe("video settings panel", () => {
    test("offers 1080p for general video generation settings", () => {
        expect(videoResolutionOptions.map((item) => item.value)).toContain("1080");
        expect(normalizeVideoResolutionValue("1080p")).toBe("1080");
    });

    test("falls back to vertical 1080p and 10 seconds", () => {
        expect(normalizeVideoResolutionValue("")).toBe("1080");
        expect(normalizeVideoSizeValue("")).toBe("720x1280");
        expect(videoSecondsLabel("")).toBe("10s");
    });
});
