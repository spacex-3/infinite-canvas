import { describe, expect, test } from "bun:test";

import { getImageModelCapabilities, normalizeImageQualityForModel } from "./image-model-capabilities";

describe("image model capabilities", () => {
    test("keeps five native quality values grouped into two billing tiers", () => {
        const capabilities = getImageModelCapabilities("gpt-image-2.6-flare-2k");
        expect(capabilities.qualityOptions.map((option) => option.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
        expect(capabilities.qualityOptions.map((option) => option.priceTier)).toEqual(["std", "std", "std", "xhigh", "xhigh"]);
        expect(capabilities.lockedResolution).toBe("2K");
        expect(capabilities.referenceLimit).toBe(16);
    });

    test("uses literal Gemini resolution values and omits web quality", () => {
        expect(normalizeImageQualityForModel("gemini-3.1-flash-image-preview", "high")).toBe("4k");
        expect(normalizeImageQualityForModel("gemini-3.1-flash-image-preview", "2k")).toBe("2k");
        expect(normalizeImageQualityForModel("gpt-image-2.6", "high")).toBeUndefined();
    });

    test("exposes background, mask and GIF only on supported models", () => {
        expect(getImageModelCapabilities("gpt-image-2")).toMatchObject({ supportsBackground: true, supportsMask: true, supportsGif: false });
        expect(getImageModelCapabilities("gpt-image-2.6")).toMatchObject({ supportsBackground: true, supportsMask: false, supportsGif: true });
        expect(getImageModelCapabilities("gpt-image-2.5-sunburst-4k")).toMatchObject({ supportsBackground: false, supportsGif: false, referenceLimit: 16 });
    });
});
