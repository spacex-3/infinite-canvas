import { describe, expect, test } from "bun:test";

import { normalizeVideoResolutionValue, videoResolutionOptions } from "./video-settings-panel";

describe("video settings panel", () => {
    test("offers 1080p for general video generation settings", () => {
        expect(videoResolutionOptions.map((item) => item.value)).toContain("1080");
        expect(normalizeVideoResolutionValue("1080p")).toBe("1080");
    });
});
