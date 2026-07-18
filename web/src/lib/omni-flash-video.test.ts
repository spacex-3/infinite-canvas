import { describe, expect, test } from "bun:test";

import {
    isOmniFlashEditModel,
    isOmniFlashVideoModel,
    normalizeOmniFlashAspectRatio,
    normalizeOmniFlashDuration,
    normalizeOmniFlashResolution,
    resolveOmniFlashModel,
} from "./omni-flash-video";

describe("omni-flash video helpers", () => {
    test("recognizes generate and edit models", () => {
        expect(isOmniFlashVideoModel("omni-flash")).toBe(true);
        expect(isOmniFlashVideoModel("omni-flash-vref")).toBe(true);
        expect(isOmniFlashEditModel("omni-flash-vref")).toBe(true);
        expect(isOmniFlashVideoModel("veo-omni-flash")).toBe(false);
    });

    test("switches to edit model when a reference video is present", () => {
        expect(resolveOmniFlashModel("omni-flash", true)).toBe("omni-flash-vref");
        expect(resolveOmniFlashModel("omni-flash", false)).toBe("omni-flash");
        expect(resolveOmniFlashModel("omni-flash-vref", false)).toBe("omni-flash-vref");
    });

    test("maps UI ratios and sizes to landscape/portrait", () => {
        expect(normalizeOmniFlashAspectRatio("16:9")).toBe("landscape");
        expect(normalizeOmniFlashAspectRatio("9:16")).toBe("portrait");
        expect(normalizeOmniFlashAspectRatio("1280x720")).toBe("landscape");
        expect(normalizeOmniFlashAspectRatio("720x1280")).toBe("portrait");
        expect(normalizeOmniFlashAspectRatio("auto", 1080, 1920)).toBe("portrait");
        expect(normalizeOmniFlashAspectRatio("1:1", 1920, 1080)).toBe("landscape");
        expect(normalizeOmniFlashAspectRatio("landscape")).toBe("landscape");
        expect(normalizeOmniFlashAspectRatio("portrait")).toBe("portrait");
    });

    test("maps quality and duration values", () => {
        expect(normalizeOmniFlashResolution("720")).toBe("720p");
        expect(normalizeOmniFlashResolution("1080p")).toBe("1080p");
        expect(normalizeOmniFlashResolution("high")).toBe("1080p");
        expect(normalizeOmniFlashDuration("6", false)).toBe(6);
        expect(normalizeOmniFlashDuration("7", false)).toBe(8);
        expect(normalizeOmniFlashDuration("4", true)).toBe(10);
        expect(normalizeOmniFlashDuration("12", false)).toBe(10);
    });
});
