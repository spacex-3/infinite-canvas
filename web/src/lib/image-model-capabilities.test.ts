import { describe, expect, test } from "bun:test";

import { getImageModelCapabilities, imageModelFamilies, imageModelTierOptions, normalizeImageQualityForModel, selectImageModelFamily } from "./image-model-capabilities";

describe("image model capabilities", () => {
    test("keeps five native quality values grouped into two billing tiers", () => {
        const capabilities = getImageModelCapabilities("gpt-image-2.6-flare-2k");
        expect(capabilities.qualityOptions.map((option) => option.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
        expect(capabilities.qualityOptions.map((option) => option.priceTier)).toEqual(["std", "std", "std", "xhigh", "xhigh"]);
        expect(capabilities.lockedResolution).toBe("2K");
        expect(capabilities.referenceLimit).toBe(16);
        expect(capabilities.supportsExplicitDimensions).toBe(false);
    });

    test("uses literal Gemini resolution values and omits web quality", () => {
        expect(normalizeImageQualityForModel("gemini-3.1-flash-image-preview", "high")).toBe("4k");
        expect(normalizeImageQualityForModel("gemini-3.1-flash-image-preview", "2k")).toBe("2k");
        expect(normalizeImageQualityForModel("gpt-image-2.6", "high")).toBeUndefined();
    });

    test("exposes background, mask and GIF only on supported models", () => {
        expect(getImageModelCapabilities("gpt-image-2")).toMatchObject({ supportsBackground: true, supportsMask: true, supportsGif: false });
        expect(getImageModelCapabilities("gpt-image-2.6")).toMatchObject({ supportsBackground: true, supportsMask: false, supportsGif: true });
        expect(getImageModelCapabilities("gpt-image-2.5-sunburst-4k")).toMatchObject({ supportsBackground: true, supportsGif: false, referenceLimit: 16 });
        expect(getImageModelCapabilities("gpt-image-2.6-flare")).toMatchObject({ lockedResolution: "超分静图 · 按自身尺寸输出", supportsGif: false, qualityOptions: [] });
    });

    test("collapses complete GPT Image ids into a family and exposes only available tiers", () => {
        const models = ["gpt-image-2.6-flare", "gpt-image-2.6-flare-1k", "gpt-image-2.6-flare-4k", "gemini-3.1-flash-image-preview"];
        expect(imageModelFamilies(models)).toEqual(["gpt-image-2.6-flare", "gemini-3.1-flash-image-preview"]);
        expect(imageModelTierOptions("gpt-image-2.6-flare-4k", models)).toEqual([
            { value: "super-resolution", model: "gpt-image-2.6-flare" },
            { value: "1k", model: "gpt-image-2.6-flare-1k" },
            { value: "4k", model: "gpt-image-2.6-flare-4k" },
        ]);
        expect(selectImageModelFamily("gpt-image-2.6-flare", models, "gpt-image-2.6-flare-4k")).toBe("gpt-image-2.6-flare-4k");
    });
});
