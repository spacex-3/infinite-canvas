import { describe, expect, test } from "bun:test";

import { canUseCustomChannel, defaultConfig, filterModelsByCapability, normalizeCustomChannelProtocol, resolveEffectiveConfig } from "./use-config-store";

describe("custom channel access", () => {
    test("allows administrators regardless of the public switch", () => {
        expect(canUseCustomChannel("admin", false)).toBe(true);
    });

    test("allows ordinary users only when the public switch is enabled", () => {
        expect(canUseCustomChannel("user", true)).toBe(true);
        expect(canUseCustomChannel("user", false)).toBe(false);
        expect(canUseCustomChannel("guest", true)).toBe(false);
        expect(canUseCustomChannel(undefined, true)).toBe(false);
    });

    test("normalizes persisted custom channel protocols", () => {
        expect(normalizeCustomChannelProtocol("zerofall")).toBe("zerofall");
        expect(normalizeCustomChannelProtocol("fpbrowser2api")).toBe("fpbrowser2api");
        expect(normalizeCustomChannelProtocol("unknown")).toBe("openai");
        expect(normalizeCustomChannelProtocol(undefined)).toBe("openai");
    });

    test("falls back to cloud mode without deleting a saved local channel", () => {
        const config = { ...defaultConfig, channelMode: "local" as const, protocol: "zerofall" as const, baseUrl: "https://custom.example.com", apiKey: "local-key", models: ["omni-flash"] };
        const cloudChannel = {
            availableModels: ["gpt-5.5", "veo-omni-flash"],
            modelCosts: [],
            defaultModel: "gpt-5.5",
            defaultImageModel: "",
            defaultVideoModel: "veo-omni-flash",
            defaultTextModel: "gpt-5.5",
            systemPrompt: "cloud prompt",
            allowCustomChannel: false,
        };

        const disabled = resolveEffectiveConfig(config, cloudChannel, false);
        expect(disabled.channelMode).toBe("remote");
        expect(disabled.models).toEqual(cloudChannel.availableModels);
        expect(disabled.videoModel).toBe("veo-omni-flash");
        expect(disabled.baseUrl).toBe(config.baseUrl);
        expect(disabled.apiKey).toBe(config.apiKey);
        expect(config.channelMode).toBe("local");
        expect(config.models).toEqual(["omni-flash"]);

        expect(resolveEffectiveConfig(config, cloudChannel, true).channelMode).toBe("local");
    });
});

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
