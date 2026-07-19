import { describe, expect, test } from "bun:test";

import * as configStore from "./use-config-store";

const { assertChannelSupportsCapability, canUseCustomChannel, defaultConfig, filterModelsByCapability, isModelAvailableForCapability, isModelSelectedForChannel, normalizeCustomChannelProtocol, resolveEffectiveConfig } = configStore;

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
        expect(normalizeCustomChannelProtocol("gemini")).toBe("gemini");
        expect(normalizeCustomChannelProtocol("zerofall")).toBe("zerofall");
        expect(normalizeCustomChannelProtocol("fpbrowser2api")).toBe("fpbrowser2api");
        expect(normalizeCustomChannelProtocol("unknown")).toBe("openai");
        expect(normalizeCustomChannelProtocol(undefined)).toBe("openai");
    });

    test("uses independent vertical 1080p 10-second video defaults", () => {
        expect(defaultConfig.videoSize).toBe("9:16");
        expect(defaultConfig.videoSeconds).toBe("10");
        expect(defaultConfig.vquality).toBe("1080p");
        expect(defaultConfig.size).toBe("1:1");
    });

    test("resolves image and video models through different custom channels", () => {
        expect(typeof configStore.resolveCustomChannelConfig).toBe("function");
        const resolveCustomChannelConfig = configStore.resolveCustomChannelConfig!;
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            imageChannelId: "image-channel",
            videoChannelId: "video-channel",
            customChannels: [
                {
                    id: "image-channel",
                    name: "Gemini 图片",
                    protocol: "gemini" as const,
                    baseUrl: "https://image.example.com",
                    apiKey: "image-key",
                    models: ["gemini-image"],
                    imageModels: ["gemini-image"],
                    videoModels: [],
                    textModels: [],
                    audioModels: [],
                },
                {
                    id: "video-channel",
                    name: "zpika 视频",
                    protocol: "zerofall" as const,
                    baseUrl: "https://video.example.com",
                    apiKey: "video-key",
                    models: ["omni-flash"],
                    imageModels: [],
                    videoModels: ["omni-flash"],
                    textModels: [],
                    audioModels: [],
                },
            ],
        };

        expect(resolveCustomChannelConfig(config, "image", "gemini-image")).toMatchObject({ protocol: "gemini", baseUrl: "https://image.example.com", apiKey: "image-key", model: "gemini-image" });
        expect(resolveCustomChannelConfig(config, "video", "omni-flash")).toMatchObject({ protocol: "zerofall", baseUrl: "https://video.example.com", apiKey: "video-key", model: "omni-flash" });
    });

    test("limits Gemini custom channels to image capability", () => {
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            protocol: "gemini" as const,
            customChannels: [
                {
                    id: "gemini-channel",
                    name: "Gemini",
                    protocol: "gemini" as const,
                    baseUrl: "https://gemini.example.com",
                    apiKey: "gemini-key",
                    models: ["gemini-image", "gemini-text"],
                    imageModels: ["gemini-image"],
                    videoModels: ["gemini-text"],
                    textModels: ["gemini-text"],
                    audioModels: ["gemini-text"],
                },
            ],
        };
        const effective = resolveEffectiveConfig(config, null, true);

        expect(effective.customChannels[0]).toMatchObject({ videoModels: [], textModels: [], audioModels: [] });
        expect(() => assertChannelSupportsCapability(config, "video")).toThrow("Gemini 原生图片协议仅支持图片生成和参考图编辑");
        expect(() => assertChannelSupportsCapability({ ...config, channelMode: "remote" }, "video")).not.toThrow();
    });

    test("falls back to the channel that contains a node-selected model", () => {
        expect(typeof configStore.resolveCustomChannelConfig).toBe("function");
        const resolveCustomChannelConfig = configStore.resolveCustomChannelConfig!;
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            imageChannelId: "default-image",
            customChannels: [
                { id: "default-image", name: "默认图片", protocol: "openai" as const, baseUrl: "https://one.example.com", apiKey: "one", models: ["image-one"], imageModels: ["image-one"], videoModels: [], textModels: [], audioModels: [] },
                { id: "alternate-image", name: "备用图片", protocol: "gemini" as const, baseUrl: "https://two.example.com", apiKey: "two", models: ["image-two"], imageModels: ["image-two"], videoModels: [], textModels: [], audioModels: [] },
            ],
        };

        expect(resolveCustomChannelConfig(config, "image", "image-two")).toMatchObject({ baseUrl: "https://two.example.com", model: "image-two" });
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

    test("requires local models to be explicitly selected before generation", () => {
        expect(isModelSelectedForChannel({ ...defaultConfig, channelMode: "local" }, defaultConfig.model)).toBe(false);
        expect(isModelSelectedForChannel({ ...defaultConfig, channelMode: "local", models: [defaultConfig.model] }, defaultConfig.model)).toBe(false);
        expect(isModelSelectedForChannel({ ...defaultConfig, channelMode: "local", models: [defaultConfig.model], imageModels: [defaultConfig.model] }, defaultConfig.model)).toBe(true);
        expect(isModelSelectedForChannel({ ...defaultConfig, channelMode: "remote" }, defaultConfig.model)).toBe(true);
    });
});

describe("model capability filters", () => {
    test("uses explicit capability lists for custom model names", () => {
        const config = { ...defaultConfig, models: ["custom-v2"], videoModels: ["custom-v2"] };

        expect(isModelAvailableForCapability(config, "custom-v2", "video")).toBe(true);
        expect(isModelAvailableForCapability(config, "custom-v2", "image")).toBe(false);
    });

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
