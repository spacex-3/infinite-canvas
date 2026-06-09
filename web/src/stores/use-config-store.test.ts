import { describe, expect, test } from "bun:test";

import { filterModelsByCapability } from "./use-config-store";

describe("model capability filters", () => {
    test("classifies fpbrowser2api banana models as image models", () => {
        const models = ["veo-omni-flash", "veo-omni-flash-video-edit", "nana-banana-2", "nana-banana-pro", "gpt-image2-1k"];

        expect(filterModelsByCapability(models, "image")).toEqual(["nana-banana-2", "nana-banana-pro", "gpt-image2-1k"]);
        expect(filterModelsByCapability(models, "video")).toEqual(["veo-omni-flash", "veo-omni-flash-video-edit"]);
    });
});
