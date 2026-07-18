import { describe, expect, test } from "bun:test";

import { filterModelsByCapability } from "./use-config-store";

describe("model capability filters", () => {
    test("classifies fpbrowser2api banana models as image models", () => {
        const models = ["veo-omni-flash", "veo-omni-flash-video-edit", "nana-banana-2", "nana-banana-pro", "gpt-image2-1k"];

        expect(filterModelsByCapability(models, "image")).toEqual(["nana-banana-2", "nana-banana-pro", "gpt-image2-1k"]);
        expect(filterModelsByCapability(models, "video")).toEqual(["veo-omni-flash", "veo-omni-flash-video-edit"]);
    });

    test("classifies ZeroFall omni-flash models as video models", () => {
        const models = ["omni-flash", "omni-flash-vref", "nana-banana-pro", "gpt-5.5"];

        expect(filterModelsByCapability(models, "video")).toEqual(["omni-flash", "omni-flash-vref"]);
        expect(filterModelsByCapability(models, "image")).toEqual(["nana-banana-pro"]);
        expect(filterModelsByCapability(models, "text")).toEqual(["gpt-5.5"]);
    });
});
