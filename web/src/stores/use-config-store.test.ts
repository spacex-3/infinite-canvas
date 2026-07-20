import { describe, expect, test } from "bun:test";

import * as configStore from "./use-config-store";

const {
    applyPreferredModelsToChannel,
    assertChannelSupportsCapability,
    canUseCustomChannel,
    defaultConfig,
    filterModelsByCapability,
    isModelAvailableForCapability,
    isModelSelectedForChannel,
    migrateConfigToZpikaPreset,
    normalizeCustomChannelProtocol,
    resolveChannelBaseUrl,
    resolveCustomChannelConfig,
    resolveEffectiveConfig,
    ZPIKA_BASE_URL,
    ZPIKA_DEFAULT_MODELS,
    ZPIKA_DIRECT_BASE_URL,
    ZPIKA_GROUP_IDS,
} = configStore;

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
        expect(defaultConfig.quality).toBe("high");
        expect(defaultConfig.size).toBe("9:16");
        expect(defaultConfig.count).toBe("1");
        expect(defaultConfig.canvasImageCount).toBe("1");
    });

    test("locks zpika dual hosts and preferred defaults", () => {
        expect(defaultConfig.baseUrl).toBe(ZPIKA_BASE_URL);
        expect(defaultConfig.directBaseUrl).toBe(ZPIKA_DIRECT_BASE_URL);
        expect(defaultConfig.imageModel).toBe(ZPIKA_DEFAULT_MODELS.geminiImage);
        expect(defaultConfig.videoModel).toBe(ZPIKA_DEFAULT_MODELS.video);
        expect(defaultConfig.textModel).toBe(ZPIKA_DEFAULT_MODELS.text);
        expect(defaultConfig.customChannels.map((channel) => channel.id)).toEqual([
            ZPIKA_GROUP_IDS.text,
            ZPIKA_GROUP_IDS.openaiImage,
            ZPIKA_GROUP_IDS.geminiImage,
            ZPIKA_GROUP_IDS.video,
        ]);
        expect(defaultConfig.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.text)?.hostMode).toBe("base");
        expect(defaultConfig.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.geminiImage)?.hostMode).toBe("direct");
        expect(defaultConfig.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.video)?.hostMode).toBe("direct");
    });

    test("upgrades generation defaults once for second-dev product settings", () => {
        expect(typeof configStore.migrateGenerationDefaults).toBe("function");
        expect(configStore.migrateGenerationDefaults!({ quality: "auto", size: "1:1" }, 0)).toMatchObject({ quality: "high", size: "9:16" });
        expect(configStore.migrateGenerationDefaults!({ quality: "auto", size: "16:9" }, 0)).toMatchObject({ quality: "auto", size: "16:9" });
        expect(configStore.migrateGenerationDefaults!({ quality: "auto", size: "1:1", canvasImageCount: "3", videoSeconds: "6", vquality: "720" }, 2)).toMatchObject({
            quality: "high",
            size: "9:16",
            canvasImageCount: "1",
            videoSeconds: "10",
            vquality: "1080p",
        });
        expect(configStore.migrateGenerationDefaults!({ quality: "high", size: "1:1", canvasImageCount: "3", videoSeconds: "6", vquality: "720p" }, 3)).toMatchObject({
            quality: "high",
            size: "9:16",
            canvasImageCount: "1",
            videoSeconds: "10",
            vquality: "1080p",
        });
        // already on v4 — leave intentional user choices alone
        expect(configStore.migrateGenerationDefaults!({ quality: "medium", size: "1:1", canvasImageCount: "3", videoSeconds: "6", vquality: "720" }, 4)).toMatchObject({
            quality: "medium",
            size: "1:1",
            canvasImageCount: "3",
            videoSeconds: "6",
            vquality: "720",
        });
        // migrateImageDefaults remains as a compatible alias
        expect(configStore.migrateImageDefaults!({ quality: "auto", size: "1:1" }, 0)).toMatchObject({ quality: "high", size: "9:16" });
    });

    test("migrates legacy multi-channel keys and models into locked zpika groups", () => {
        const migrated = migrateConfigToZpikaPreset({
            channelMode: "local",
            imageChannelId: "old-gemini",
            videoChannelId: "old-video",
            textChannelId: "old-text",
            imageModel: "gemini-3-pro-image-preview",
            videoModel: "veo-omni-flash",
            textModel: "gpt-5.6-terra",
            customChannels: [
                {
                    id: "old-text",
                    name: "文字分组",
                    protocol: "openai",
                    baseUrl: "https://vip.example.com",
                    apiKey: "text-key",
                    models: ["gpt-5.6-terra", "gpt-5.6-sol"],
                    imageModels: [],
                    videoModels: [],
                    textModels: ["gpt-5.6-terra", "gpt-5.6-sol"],
                    audioModels: [],
                },
                {
                    id: "old-gemini",
                    name: "Gemini 图片",
                    protocol: "gemini",
                    baseUrl: "https://img.example.com",
                    apiKey: "gemini-key",
                    models: ["gemini-3-pro-image-preview"],
                    imageModels: ["gemini-3-pro-image-preview"],
                    videoModels: [],
                    textModels: [],
                    audioModels: [],
                },
                {
                    id: "old-openai-image",
                    name: "OpenAI 画图",
                    protocol: "openai",
                    baseUrl: "https://img2.example.com",
                    apiKey: "openai-image-key",
                    models: ["gpt-image-2"],
                    imageModels: ["gpt-image-2"],
                    videoModels: [],
                    textModels: [],
                    audioModels: [],
                },
                {
                    id: "old-video",
                    name: "视频",
                    protocol: "fpbrowser2api",
                    baseUrl: "https://video.example.com",
                    apiKey: "video-key",
                    models: ["veo-omni-flash", "veo-omni-flash-video-edit"],
                    imageModels: [],
                    videoModels: ["veo-omni-flash", "veo-omni-flash-video-edit"],
                    textModels: [],
                    audioModels: [],
                },
            ],
        });

        expect(migrated.customChannels).toHaveLength(4);
        expect(migrated.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.text)).toMatchObject({
            apiKey: "text-key",
            textModels: ["gpt-5.6-terra", "gpt-5.6-sol"],
            hostMode: "base",
            locked: true,
        });
        expect(migrated.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.geminiImage)).toMatchObject({
            apiKey: "gemini-key",
            imageModels: ["gemini-3-pro-image-preview"],
            hostMode: "direct",
            protocol: "gemini",
        });
        expect(migrated.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.openaiImage)).toMatchObject({
            apiKey: "openai-image-key",
            imageModels: ["gpt-image-2"],
            hostMode: "direct",
            protocol: "openai",
        });
        expect(migrated.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.video)).toMatchObject({
            apiKey: "video-key",
            videoModels: ["veo-omni-flash", "veo-omni-flash-video-edit"],
            hostMode: "direct",
            protocol: "fpbrowser2api",
        });
        expect(migrated.imageChannelId).toBe(ZPIKA_GROUP_IDS.geminiImage);
        expect(migrated.videoChannelId).toBe(ZPIKA_GROUP_IDS.video);
        expect(migrated.textChannelId).toBe(ZPIKA_GROUP_IDS.text);
        expect(migrated.imageModel).toBe("gemini-3-pro-image-preview");
        expect(migrated.videoModel).toBe("veo-omni-flash");
        expect(migrated.textModel).toBe("gpt-5.6-terra");
    });

    test("routes image and video through the direct host and text through vip", () => {
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            imageChannelId: ZPIKA_GROUP_IDS.geminiImage,
            videoChannelId: ZPIKA_GROUP_IDS.video,
            textChannelId: ZPIKA_GROUP_IDS.text,
            customChannels: defaultConfig.customChannels.map((channel) => {
                if (channel.id === ZPIKA_GROUP_IDS.geminiImage) {
                    return { ...channel, apiKey: "image-key", models: ["gemini-3-pro-image-preview"], imageModels: ["gemini-3-pro-image-preview"] };
                }
                if (channel.id === ZPIKA_GROUP_IDS.video) {
                    return { ...channel, apiKey: "video-key", models: ["veo-omni-flash"], videoModels: ["veo-omni-flash"] };
                }
                if (channel.id === ZPIKA_GROUP_IDS.text) {
                    return { ...channel, apiKey: "text-key", models: ["gpt-5.6-terra"], textModels: ["gpt-5.6-terra"] };
                }
                return channel;
            }),
        };

        expect(resolveCustomChannelConfig(config, "image", "gemini-3-pro-image-preview")).toMatchObject({
            protocol: "gemini",
            baseUrl: ZPIKA_DIRECT_BASE_URL,
            apiKey: "image-key",
            model: "gemini-3-pro-image-preview",
        });
        expect(resolveCustomChannelConfig(config, "video", "veo-omni-flash")).toMatchObject({
            protocol: "fpbrowser2api",
            baseUrl: ZPIKA_DIRECT_BASE_URL,
            apiKey: "video-key",
            model: "veo-omni-flash",
        });
        expect(resolveCustomChannelConfig(config, "text", "gpt-5.6-terra")).toMatchObject({
            protocol: "openai",
            baseUrl: ZPIKA_BASE_URL,
            apiKey: "text-key",
            model: "gpt-5.6-terra",
        });
        expect(resolveChannelBaseUrl(config, { hostMode: "direct", baseUrl: "https://ignored.example.com" })).toBe(ZPIKA_DIRECT_BASE_URL);
        expect(resolveChannelBaseUrl(config, { hostMode: "base", baseUrl: "https://ignored.example.com" })).toBe(ZPIKA_BASE_URL);
    });

    test("auto-selects preferred models that exist in the fetched list", () => {
        const channel = defaultConfig.customChannels.find((item) => item.id === ZPIKA_GROUP_IDS.geminiImage)!;
        const patched = applyPreferredModelsToChannel(channel, ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview", "other-image"]);
        expect(patched.models).toEqual(["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"]);
        expect(patched.imageModels).toEqual(["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"]);
    });

    test("limits Gemini custom channels to image capability", () => {
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            protocol: "gemini" as const,
            customChannels: defaultConfig.customChannels.map((channel) =>
                channel.id === ZPIKA_GROUP_IDS.geminiImage
                    ? {
                          ...channel,
                          apiKey: "gemini-key",
                          models: ["gemini-3-pro-image-preview"],
                          imageModels: ["gemini-3-pro-image-preview"],
                      }
                    : channel,
            ),
        };
        const effective = resolveEffectiveConfig(config, null, true);
        const gemini = effective.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.geminiImage);
        expect(gemini).toMatchObject({ videoModels: [], textModels: [], audioModels: [], imageModels: ["gemini-3-pro-image-preview"] });
        expect(() => assertChannelSupportsCapability(config, "video")).toThrow("Gemini 原生图片协议仅支持图片生成和参考图编辑");
        expect(() => assertChannelSupportsCapability({ ...config, channelMode: "remote" }, "video")).not.toThrow();
    });

    test("falls back to the channel that contains a node-selected model", () => {
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            imageChannelId: ZPIKA_GROUP_IDS.openaiImage,
            customChannels: defaultConfig.customChannels.map((channel) => {
                if (channel.id === ZPIKA_GROUP_IDS.openaiImage) {
                    return { ...channel, apiKey: "one", models: ["gpt-image-2"], imageModels: ["gpt-image-2"] };
                }
                if (channel.id === ZPIKA_GROUP_IDS.geminiImage) {
                    return { ...channel, apiKey: "two", models: ["gemini-3-pro-image-preview"], imageModels: ["gemini-3-pro-image-preview"] };
                }
                return channel;
            }),
        };

        expect(resolveCustomChannelConfig(config, "image", "gemini-3-pro-image-preview")).toMatchObject({
            baseUrl: ZPIKA_DIRECT_BASE_URL,
            apiKey: "two",
            model: "gemini-3-pro-image-preview",
            protocol: "gemini",
        });
    });

    test("falls back to cloud mode without deleting a saved local channel", () => {
        const config = {
            ...defaultConfig,
            channelMode: "local" as const,
            protocol: "fpbrowser2api" as const,
            baseUrl: ZPIKA_BASE_URL,
            apiKey: "local-key",
            models: ["veo-omni-flash"],
            customChannels: defaultConfig.customChannels.map((channel) =>
                channel.id === ZPIKA_GROUP_IDS.video
                    ? { ...channel, apiKey: "local-key", models: ["veo-omni-flash"], videoModels: ["veo-omni-flash"] }
                    : channel,
            ),
        };
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
        expect(config.channelMode).toBe("local");
        expect(config.customChannels.find((channel) => channel.id === ZPIKA_GROUP_IDS.video)?.apiKey).toBe("local-key");

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
