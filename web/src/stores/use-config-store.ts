"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export type ModelCapability = "image" | "video" | "text" | "audio";
export type CustomChannelProtocol = "openai" | "gemini" | "fpbrowser2api" | "zerofall";
export type CustomChannelHostMode = "base" | "direct";

export type CustomAiChannel = {
    id: string;
    name: string;
    protocol: CustomChannelProtocol;
    /** Legacy field kept for migration; runtime host is resolved from locked zpika URLs. */
    baseUrl: string;
    apiKey: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    preferredModels?: string[];
    hostMode?: CustomChannelHostMode;
    locked?: boolean;
};

export type AiConfig = {
    channelMode: "remote" | "local";
    protocol: CustomChannelProtocol;
    baseUrl: string;
    directBaseUrl: string;
    apiKey: string;
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSize: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
    customChannels: CustomAiChannel[];
    imageChannelId: string;
    videoChannelId: string;
    textChannelId: string;
    audioChannelId: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export const CONFIG_STORE_VERSION = 4;

export const ZPIKA_BASE_URL = "https://vip.zpika.com";
export const ZPIKA_DIRECT_BASE_URL = "https://aivideo.zpika.com";

export const ZPIKA_GROUP_IDS = {
    text: "zpika-text",
    openaiImage: "zpika-openai-image",
    geminiImage: "zpika-gemini-image",
    video: "zpika-video",
} as const;

export const ZPIKA_PREFERRED_MODELS = {
    text: ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"],
    openaiImage: ["gpt-image-2"],
    geminiImage: ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"],
    video: ["veo-omni-flash", "veo-omni-flash-video-edit"],
} as const;

export const ZPIKA_DEFAULT_MODELS = {
    text: "gpt-5.6-terra",
    openaiImage: "gpt-image-2",
    geminiImage: "gemini-3-pro-image-preview",
    video: "veo-omni-flash",
} as const;

const defaultCustomChannels: CustomAiChannel[] = [
    {
        id: ZPIKA_GROUP_IDS.text,
        name: "文字",
        protocol: "openai",
        baseUrl: ZPIKA_BASE_URL,
        apiKey: "",
        models: [],
        imageModels: [],
        videoModels: [],
        textModels: [],
        audioModels: [],
        preferredModels: [...ZPIKA_PREFERRED_MODELS.text],
        hostMode: "base",
        locked: true,
    },
    {
        id: ZPIKA_GROUP_IDS.openaiImage,
        name: "OpenAI画图",
        protocol: "openai",
        baseUrl: ZPIKA_DIRECT_BASE_URL,
        apiKey: "",
        models: [],
        imageModels: [],
        videoModels: [],
        textModels: [],
        audioModels: [],
        preferredModels: [...ZPIKA_PREFERRED_MODELS.openaiImage],
        hostMode: "direct",
        locked: true,
    },
    {
        id: ZPIKA_GROUP_IDS.geminiImage,
        name: "Gemini画图",
        protocol: "gemini",
        baseUrl: ZPIKA_DIRECT_BASE_URL,
        apiKey: "",
        models: [],
        imageModels: [],
        videoModels: [],
        textModels: [],
        audioModels: [],
        preferredModels: [...ZPIKA_PREFERRED_MODELS.geminiImage],
        hostMode: "direct",
        locked: true,
    },
    {
        id: ZPIKA_GROUP_IDS.video,
        name: "Gemini视频",
        protocol: "fpbrowser2api",
        baseUrl: ZPIKA_DIRECT_BASE_URL,
        apiKey: "",
        models: [],
        imageModels: [],
        videoModels: [],
        textModels: [],
        audioModels: [],
        preferredModels: [...ZPIKA_PREFERRED_MODELS.video],
        hostMode: "direct",
        locked: true,
    },
];

export const defaultConfig: AiConfig = {
    channelMode: "remote",
    protocol: "openai",
    baseUrl: ZPIKA_BASE_URL,
    directBaseUrl: ZPIKA_DIRECT_BASE_URL,
    apiKey: "",
    model: ZPIKA_DEFAULT_MODELS.geminiImage,
    imageModel: ZPIKA_DEFAULT_MODELS.geminiImage,
    videoModel: ZPIKA_DEFAULT_MODELS.video,
    textModel: ZPIKA_DEFAULT_MODELS.text,
    audioModel: "gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSize: "9:16",
    videoSeconds: "10",
    vquality: "1080p",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "high",
    size: "9:16",
    count: "1",
    canvasImageCount: "1",
    customChannels: defaultCustomChannels,
    imageChannelId: ZPIKA_GROUP_IDS.geminiImage,
    videoChannelId: ZPIKA_GROUP_IDS.video,
    textChannelId: ZPIKA_GROUP_IDS.text,
    audioChannelId: ZPIKA_GROUP_IDS.text,
};

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

export function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null, canUseLocalChannel: boolean) {
    const channelMode = canUseLocalChannel ? config.channelMode : "remote";
    if (channelMode === "local") return resolveLocalEffectiveConfig({ ...config, channelMode });
    if (!modelChannel) return { ...config, channelMode };
    const models = modelChannel.availableModels;
    const textModels = filterModelsByCapability(models, "text");
    const imageModels = filterModelsByCapability(models, "image");
    const videoModels = filterModelsByCapability(models, "video");
    const audioModels = filterModelsByCapability(models, "audio");
    const fallbackTextModel = validDefault(modelChannel.defaultTextModel, textModels) || preferredModel(textModels, isTextModelName);
    const fallbackModel = validDefault(modelChannel.defaultModel, textModels) || fallbackTextModel;
    const fallbackImageModel = validDefault(modelChannel.defaultImageModel, imageModels) || preferredModel(imageModels, isImageModelName);
    const fallbackVideoModel = validDefault(modelChannel.defaultVideoModel, videoModels) || preferredModel(videoModels, isVideoModelName);
    const fallbackAudioModel = preferredModel(audioModels, isAudioModelName);
    return {
        ...config,
        channelMode,
        models,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: textModels.includes(config.model) ? config.model : fallbackModel,
        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : fallbackImageModel,
        videoModel: videoModels.includes(config.videoModel) ? config.videoModel : fallbackVideoModel,
        textModel: textModels.includes(config.textModel) ? config.textModel : fallbackTextModel || fallbackModel,
        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : fallbackAudioModel,
        systemPrompt: modelChannel.systemPrompt,
    };
}

export function canUseCustomChannel(role: "guest" | "user" | "admin" | undefined, allowCustomChannel: boolean) {
    return role === "admin" || (role === "user" && allowCustomChannel);
}

export function normalizeCustomChannelProtocol(value: unknown): CustomChannelProtocol {
    return value === "gemini" || value === "zerofall" || value === "fpbrowser2api" ? value : "openai";
}

/** One-shot upgrades for generation defaults that used to ship as official product defaults. */
export function migrateGenerationDefaults<
    T extends {
        quality?: string;
        size?: string;
        count?: string;
        canvasImageCount?: string;
        videoSeconds?: string;
        vquality?: string;
        videoSize?: string;
    },
>(config: T, persistedVersion: number): T {
    let next = { ...config };

    // v2: previous image default was auto quality + 1:1 → 4K
    if (persistedVersion < 2 && next.quality === "auto" && (next.size === "1:1" || !next.size)) {
        next = { ...next, quality: "high" };
    }

    // v4: second-dev product defaults — portrait 4K image, 1 canvas image, 1080p/10s video
    if (persistedVersion < 4) {
        if (!next.size || next.size === "1:1") {
            next = { ...next, size: "9:16" };
        }
        if (next.quality === "auto" && next.size === "9:16") {
            next = { ...next, quality: "high" };
        }
        // Official canvas default used to be 3 images; product default is 1.
        if (String(next.canvasImageCount || "") === "3") {
            next = { ...next, canvasImageCount: "1" };
        }
        if (!next.videoSeconds || next.videoSeconds === "6") {
            next = { ...next, videoSeconds: "10" };
        }
        const vquality = String(next.vquality || "").toLowerCase();
        if (!vquality || vquality === "720" || vquality === "720p") {
            next = { ...next, vquality: "1080p" };
        }
        if (!next.videoSize) {
            next = { ...next, videoSize: "9:16" };
        }
    }

    return next;
}

/** @deprecated Prefer migrateGenerationDefaults — kept for existing imports/tests. */
export const migrateImageDefaults = migrateGenerationDefaults;

export function assertChannelSupportsCapability(config: Pick<AiConfig, "channelMode" | "protocol">, capability: ModelCapability) {
    if (config.channelMode === "local" && config.protocol === "gemini" && capability !== "image") {
        throw new Error("Gemini 原生图片协议仅支持图片生成和参考图编辑");
    }
}

function validDefault(model: string, models: string[]) {
    return models.includes(model) ? model : "";
}

function preferredModel(models: string[], predicate: (model: string) => boolean) {
    return models.find(predicate) || "";
}

function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("omni-flash");
}

function isImageModelName(model: string) {
    const value = model.toLowerCase();
    return (
        !isVideoModelName(model) &&
        !isAudioModelName(model) &&
        (value.includes("seedream") ||
            value.includes("gpt-image") ||
            value.includes("image") ||
            value.includes("nana-banana") ||
            value.includes("dall-e") ||
            value.includes("dalle") ||
            value.includes("imagen") ||
            value.includes("flux") ||
            value.includes("sdxl") ||
            value.includes("stable-diffusion") ||
            value.includes("midjourney") ||
            (value.includes("gemini-3") && value.includes("image")))
    );
}

function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

export function isModelAvailableForCapability(config: AiConfig, model: string, capability: ModelCapability) {
    return selectableModelsByCapability(config, capability).includes(model.trim());
}

export function isModelSelectedForChannel(config: Pick<AiConfig, "channelMode" | "models" | "imageModels" | "videoModels" | "textModels" | "audioModels"> & Partial<Pick<AiConfig, "customChannels">>, model: string) {
    if (config.channelMode === "remote") return true;
    const value = model.trim();
    if (config.customChannels?.some((channel) => channel.models.includes(value) && [...channel.imageModels, ...channel.videoModels, ...channel.textModels, ...channel.audioModels].includes(value))) return true;
    return config.models.includes(value) && [...config.imageModels, ...config.videoModels, ...config.textModels, ...config.audioModels].includes(value);
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    if (!model.trim() || !isModelSelectedForChannel(config, model)) return false;
    if (config.channelMode === "remote") return true;
    const channel = config.customChannels.find((item) => item.models.includes(model) && [...item.imageModels, ...item.videoModels, ...item.textModels, ...item.audioModels].includes(model));
    if (!channel?.apiKey.trim()) return false;
    return Boolean(resolveChannelBaseUrl(config, channel).trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            version: CONFIG_STORE_VERSION,
            migrate: (persisted, version) => {
                const state = persisted as Partial<ConfigStore>;
                const config = migrateGenerationDefaults(state.config || {}, version);
                return { ...state, config: migrateConfigToZpikaPreset(config, version) };
            },
            partialize: (state) => ({ config: state.config }),
            merge: (persisted, current) => {
                const persistedConfig = ((persisted as Partial<ConfigStore>).config || {}) as Partial<AiConfig>;
                const migrated = migrateConfigToZpikaPreset({ ...defaultConfig, ...persistedConfig }, CONFIG_STORE_VERSION);
                const customChannels = normalizeCustomChannels(migrated.customChannels, migrated);
                return {
                    ...current,
                    config: {
                        ...migrated,
                        channelMode: migrated.channelMode === "local" ? "local" : "remote",
                        protocol: normalizeCustomChannelProtocol(migrated.protocol),
                        baseUrl: ZPIKA_BASE_URL,
                        directBaseUrl: ZPIKA_DIRECT_BASE_URL,
                        imageModel: migrated.imageModel || ZPIKA_DEFAULT_MODELS.geminiImage,
                        videoModel: migrated.videoModel || ZPIKA_DEFAULT_MODELS.video,
                        textModel: migrated.textModel || ZPIKA_DEFAULT_MODELS.text,
                        audioModel: migrated.audioModel || defaultConfig.audioModel,
                        audioVoice: migrated.audioVoice || defaultConfig.audioVoice,
                        audioFormat: migrated.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: migrated.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: migrated.audioInstructions || "",
                        videoSize: migrated.videoSize || defaultConfig.videoSize,
                        videoSeconds: migrated.videoSeconds || defaultConfig.videoSeconds,
                        vquality: migrated.vquality || defaultConfig.vquality,
                        videoGenerateAudio: migrated.videoGenerateAudio || "true",
                        videoWatermark: migrated.videoWatermark || "false",
                        canvasImageCount: migrated.canvasImageCount || "1",
                        imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(migrated.imageModels) : filterModelsByCapability(migrated.models, "image"),
                        videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(migrated.videoModels) : filterModelsByCapability(migrated.models, "video"),
                        textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(migrated.textModels) : filterModelsByCapability(migrated.models, "text"),
                        audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(migrated.audioModels) : filterModelsByCapability(migrated.models, "audio"),
                        customChannels,
                        imageChannelId: normalizeCapabilityChannelId(migrated.imageChannelId, customChannels, "image"),
                        videoChannelId: normalizeCapabilityChannelId(migrated.videoChannelId, customChannels, "video"),
                        textChannelId: normalizeCapabilityChannelId(migrated.textChannelId, customChannels, "text"),
                        audioChannelId: normalizeCapabilityChannelId(migrated.audioChannelId, customChannels, "audio"),
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[] | undefined) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function createZpikaPresetChannels(seed: Partial<CustomAiChannel>[] = []): CustomAiChannel[] {
    const byId = new Map(seed.map((channel) => [channel.id || "", channel]));
    return defaultCustomChannels.map((template) => {
        const existing = byId.get(template.id);
        const models = normalizeModelList(existing?.models || template.models);
        const preferredModels = normalizeModelList(existing?.preferredModels || template.preferredModels || []);
        const capabilityModels = (raw: string[] | undefined) => {
            const selected = normalizeModelList(raw || []).filter((model) => models.includes(model));
            return selected.length ? selected : models;
        };
        const isImageGroup = template.id === ZPIKA_GROUP_IDS.openaiImage || template.id === ZPIKA_GROUP_IDS.geminiImage;
        const isVideoGroup = template.id === ZPIKA_GROUP_IDS.video;
        const isTextGroup = template.id === ZPIKA_GROUP_IDS.text;
        return {
            ...template,
            apiKey: String(existing?.apiKey || "").trim(),
            models,
            preferredModels,
            imageModels: isImageGroup ? capabilityModels(existing?.imageModels) : [],
            videoModels: isVideoGroup ? capabilityModels(existing?.videoModels) : [],
            textModels: isTextGroup ? capabilityModels(existing?.textModels).filter((model) => !isAudioModelName(model)) : [],
            audioModels: isTextGroup ? capabilityModels(existing?.audioModels).filter((model) => isAudioModelName(model) || (existing?.audioModels || []).includes(model)) : [],
            baseUrl: template.hostMode === "direct" ? ZPIKA_DIRECT_BASE_URL : ZPIKA_BASE_URL,
            hostMode: template.hostMode,
            locked: true,
        };
    });
}

export function migrateConfigToZpikaPreset(config: Partial<AiConfig>, _persistedVersion = 0): AiConfig {
    const base = { ...defaultConfig, ...config };
    const legacyChannels = Array.isArray(config.customChannels) ? config.customChannels : [];
    const mapped = mapLegacyChannelsToZpikaGroups(legacyChannels, config);
    const customChannels = createZpikaPresetChannels(mapped);
    const next: AiConfig = {
        ...base,
        baseUrl: ZPIKA_BASE_URL,
        directBaseUrl: ZPIKA_DIRECT_BASE_URL,
        customChannels,
        imageChannelId: pickMigratedChannelId(config.imageChannelId, customChannels, "image", ZPIKA_GROUP_IDS.geminiImage, legacyChannels, mapped),
        videoChannelId: pickMigratedChannelId(config.videoChannelId, customChannels, "video", ZPIKA_GROUP_IDS.video, legacyChannels, mapped),
        textChannelId: pickMigratedChannelId(config.textChannelId, customChannels, "text", ZPIKA_GROUP_IDS.text, legacyChannels, mapped),
        audioChannelId: pickMigratedChannelId(config.audioChannelId, customChannels, "audio", ZPIKA_GROUP_IDS.text, legacyChannels, mapped),
    };

    next.imageModel = resolveMigratedDefaultModel(next, "image", config.imageModel || ZPIKA_DEFAULT_MODELS.geminiImage, ZPIKA_DEFAULT_MODELS.geminiImage);
    next.videoModel = resolveMigratedDefaultModel(next, "video", config.videoModel || ZPIKA_DEFAULT_MODELS.video, ZPIKA_DEFAULT_MODELS.video);
    next.textModel = resolveMigratedDefaultModel(next, "text", config.textModel || config.model || ZPIKA_DEFAULT_MODELS.text, ZPIKA_DEFAULT_MODELS.text);
    next.audioModel = resolveMigratedDefaultModel(next, "audio", config.audioModel || defaultConfig.audioModel, defaultConfig.audioModel);
    next.model = next.imageModel;
    return next;
}

function mapLegacyChannelsToZpikaGroups(legacyChannels: CustomAiChannel[], config: Partial<AiConfig>) {
    const buckets: Record<string, Partial<CustomAiChannel>> = {
        [ZPIKA_GROUP_IDS.text]: { id: ZPIKA_GROUP_IDS.text, models: [], textModels: [], audioModels: [], preferredModels: [...ZPIKA_PREFERRED_MODELS.text] },
        [ZPIKA_GROUP_IDS.openaiImage]: { id: ZPIKA_GROUP_IDS.openaiImage, models: [], imageModels: [], preferredModels: [...ZPIKA_PREFERRED_MODELS.openaiImage] },
        [ZPIKA_GROUP_IDS.geminiImage]: { id: ZPIKA_GROUP_IDS.geminiImage, models: [], imageModels: [], preferredModels: [...ZPIKA_PREFERRED_MODELS.geminiImage] },
        [ZPIKA_GROUP_IDS.video]: { id: ZPIKA_GROUP_IDS.video, models: [], videoModels: [], preferredModels: [...ZPIKA_PREFERRED_MODELS.video] },
    };

    const pushModels = (targetId: string, models: string[], capability: ModelCapability, apiKey?: string) => {
        const bucket = buckets[targetId];
        if (!bucket) return;
        const nextModels = normalizeModelList([...(bucket.models || []), ...models]);
        bucket.models = nextModels;
        if (capability === "image") bucket.imageModels = normalizeModelList([...(bucket.imageModels || []), ...models]);
        if (capability === "video") bucket.videoModels = normalizeModelList([...(bucket.videoModels || []), ...models]);
        if (capability === "text") bucket.textModels = normalizeModelList([...(bucket.textModels || []), ...models]);
        if (capability === "audio") bucket.audioModels = normalizeModelList([...(bucket.audioModels || []), ...models]);
        if (apiKey && !bucket.apiKey) bucket.apiKey = apiKey;
    };

    for (const channel of legacyChannels) {
        const apiKey = String(channel.apiKey || "").trim();
        const protocol = normalizeCustomChannelProtocol(channel.protocol);
        const imageModels = normalizeModelList(channel.imageModels?.length ? channel.imageModels : protocol === "gemini" ? channel.models : filterModelsByCapability(channel.models, "image"));
        const videoModels = normalizeModelList(channel.videoModels?.length ? channel.videoModels : filterModelsByCapability(channel.models, "video"));
        const textModels = normalizeModelList(channel.textModels?.length ? channel.textModels : filterModelsByCapability(channel.models, "text"));
        const audioModels = normalizeModelList(channel.audioModels?.length ? channel.audioModels : filterModelsByCapability(channel.models, "audio"));

        if (protocol === "gemini" || imageModels.some((model) => model.toLowerCase().includes("gemini"))) {
            pushModels(ZPIKA_GROUP_IDS.geminiImage, imageModels.length ? imageModels : protocol === "gemini" ? normalizeModelList(channel.models) : [], "image", apiKey);
        }
        if (imageModels.some((model) => model.toLowerCase().includes("gpt-image") || model.toLowerCase().includes("dall-e") || model.toLowerCase().includes("dalle")) || (protocol === "openai" && imageModels.length && !imageModels.some((model) => model.toLowerCase().includes("gemini")))) {
            pushModels(ZPIKA_GROUP_IDS.openaiImage, imageModels, "image", apiKey);
        }
        if (videoModels.length || protocol === "fpbrowser2api" || protocol === "zerofall") {
            pushModels(ZPIKA_GROUP_IDS.video, videoModels.length ? videoModels : protocol === "fpbrowser2api" || protocol === "zerofall" ? normalizeModelList(channel.models) : [], "video", apiKey);
        }
        if (textModels.length || audioModels.length || (protocol === "openai" && !imageModels.length && !videoModels.length)) {
            pushModels(ZPIKA_GROUP_IDS.text, textModels.length ? textModels : protocol === "openai" ? normalizeModelList(channel.models) : [], "text", apiKey);
            if (audioModels.length) pushModels(ZPIKA_GROUP_IDS.text, audioModels, "audio", apiKey);
        }

        // Fallback: unknown channel with only a key still preserves the key onto the closest group by name.
        if (!imageModels.length && !videoModels.length && !textModels.length && !audioModels.length && apiKey) {
            const name = `${channel.name || ""}`.toLowerCase();
            if (name.includes("gemini") && name.includes("图")) pushModels(ZPIKA_GROUP_IDS.geminiImage, [], "image", apiKey);
            else if (name.includes("openai") || name.includes("gpt-image") || name.includes("超分")) pushModels(ZPIKA_GROUP_IDS.openaiImage, [], "image", apiKey);
            else if (name.includes("video") || name.includes("视频") || name.includes("veo") || name.includes("omni")) pushModels(ZPIKA_GROUP_IDS.video, [], "video", apiKey);
            else pushModels(ZPIKA_GROUP_IDS.text, [], "text", apiKey);
        }
    }

    // Preserve top-level legacy single-key config if groups still empty.
    if (String(config.apiKey || "").trim()) {
        const key = String(config.apiKey || "").trim();
        for (const id of Object.keys(buckets)) {
            if (!buckets[id].apiKey) buckets[id].apiKey = key;
        }
    }

    return Object.values(buckets);
}

function pickMigratedChannelId(preferredId: string | undefined, channels: CustomAiChannel[], capability: ModelCapability, fallbackId: string, legacyChannels: CustomAiChannel[], mapped: Partial<CustomAiChannel>[]) {
    if (preferredId && channels.some((channel) => channel.id === preferredId)) return preferredId;
    const legacy = legacyChannels.find((channel) => channel.id === preferredId);
    if (legacy) {
        const protocol = normalizeCustomChannelProtocol(legacy.protocol);
        if (capability === "image" && protocol === "gemini") return ZPIKA_GROUP_IDS.geminiImage;
        if (capability === "image") return ZPIKA_GROUP_IDS.openaiImage;
        if (capability === "video") return ZPIKA_GROUP_IDS.video;
        if (capability === "text" || capability === "audio") return ZPIKA_GROUP_IDS.text;
    }
    const modelsKey = capabilityModelsKey(capability);
    const mappedHit = mapped.find((channel) => (channel[modelsKey] || []).length);
    if (mappedHit?.id && channels.some((channel) => channel.id === mappedHit.id)) return mappedHit.id;
    return channels.find((channel) => channel[modelsKey].length)?.id || fallbackId;
}

function resolveMigratedDefaultModel(config: AiConfig, capability: ModelCapability, preferred: string, fallback: string) {
    const modelsKey = capabilityModelsKey(capability);
    const channelId = config[capabilityChannelKey(capability)];
    const channel = config.customChannels.find((item) => item.id === channelId);
    if (channel?.[modelsKey].includes(preferred)) return preferred;
    if (channel?.[modelsKey].includes(fallback)) return fallback;
    if (channel?.[modelsKey][0]) return channel[modelsKey][0];
    const all = config.customChannels.flatMap((item) => item[modelsKey]);
    if (all.includes(preferred)) return preferred;
    if (all.includes(fallback)) return fallback;
    return all[0] || preferred || fallback;
}

function normalizeCustomChannels(channels: CustomAiChannel[] | undefined, legacy: Partial<AiConfig>): CustomAiChannel[] {
    if (Array.isArray(channels) && channels.some((channel) => channel.locked || Object.values(ZPIKA_GROUP_IDS).includes(channel.id as (typeof ZPIKA_GROUP_IDS)[keyof typeof ZPIKA_GROUP_IDS]))) {
        return createZpikaPresetChannels(channels);
    }
    return createZpikaPresetChannels(mapLegacyChannelsToZpikaGroups(channels || [], legacy));
}

function capabilityModelsKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function capabilityChannelKey(capability: ModelCapability) {
    return `${capability}ChannelId` as "imageChannelId" | "videoChannelId" | "textChannelId" | "audioChannelId";
}

function capabilityModelKey(capability: ModelCapability) {
    return `${capability}Model` as "imageModel" | "videoModel" | "textModel" | "audioModel";
}

function normalizeCapabilityChannelId(value: string | undefined, channels: CustomAiChannel[], capability: ModelCapability) {
    const modelsKey = capabilityModelsKey(capability);
    return channels.find((channel) => channel.id === value && channel[modelsKey].length)?.id || channels.find((channel) => channel[modelsKey].length)?.id || channels.find((channel) => channel.id === defaultCapabilityChannelId(capability))?.id || channels[0]?.id || "";
}

function defaultCapabilityChannelId(capability: ModelCapability) {
    if (capability === "image") return ZPIKA_GROUP_IDS.geminiImage;
    if (capability === "video") return ZPIKA_GROUP_IDS.video;
    return ZPIKA_GROUP_IDS.text;
}

function resolveLocalEffectiveConfig(config: AiConfig): AiConfig {
    const channels = normalizeCustomChannels(config.customChannels, config);
    const models = normalizeModelList(channels.flatMap((channel) => channel.models));
    const next = { ...config, baseUrl: ZPIKA_BASE_URL, directBaseUrl: ZPIKA_DIRECT_BASE_URL, customChannels: channels, models };
    for (const capability of ["image", "video", "text", "audio"] as const) {
        const modelsKey = capabilityModelsKey(capability);
        const channelKey = capabilityChannelKey(capability);
        const modelKey = capabilityModelKey(capability);
        const capabilityModels = normalizeModelList(channels.flatMap((channel) => channel[modelsKey]));
        const channelId = normalizeCapabilityChannelId(config[channelKey], channels, capability);
        const preferredChannel = channels.find((channel) => channel.id === channelId);
        next[modelsKey] = capabilityModels;
        next[channelKey] = channelId;
        const preferredDefault = capability === "image" ? ZPIKA_DEFAULT_MODELS.geminiImage : capability === "video" ? ZPIKA_DEFAULT_MODELS.video : capability === "text" ? ZPIKA_DEFAULT_MODELS.text : config[modelKey];
        next[modelKey] = preferredChannel?.[modelsKey].includes(config[modelKey])
            ? config[modelKey]
            : preferredChannel?.[modelsKey].includes(preferredDefault)
              ? preferredDefault
              : preferredChannel?.[modelsKey][0] || capabilityModels[0] || preferredDefault;
    }
    return next;
}

export function resolveChannelBaseUrl(config: Pick<AiConfig, "baseUrl" | "directBaseUrl">, channel: Pick<CustomAiChannel, "hostMode" | "baseUrl">) {
    if (channel.hostMode === "direct") return ZPIKA_DIRECT_BASE_URL;
    if (channel.hostMode === "base") return ZPIKA_BASE_URL;
    // Fallback for partially migrated records.
    return String(channel.baseUrl || config.directBaseUrl || config.baseUrl || ZPIKA_BASE_URL).trim() || ZPIKA_BASE_URL;
}

export function resolveCustomChannelConfig(config: AiConfig, capability: ModelCapability, model = config.model): AiConfig {
    if (config.channelMode !== "local") return { ...config, model };
    const channels = normalizeCustomChannels(config.customChannels, config);
    const modelsKey = capabilityModelsKey(capability);
    const preferredId = config[capabilityChannelKey(capability)];
    const preferred = channels.find((channel) => channel.id === preferredId && channel[modelsKey].includes(model));
    const channel = preferred || channels.find((item) => item[modelsKey].includes(model));
    if (!channel) return { ...config, baseUrl: capability === "text" || capability === "audio" ? ZPIKA_BASE_URL : ZPIKA_DIRECT_BASE_URL, directBaseUrl: ZPIKA_DIRECT_BASE_URL, model };
    const host = resolveChannelBaseUrl(config, channel);
    return {
        ...config,
        protocol: channel.protocol,
        baseUrl: host,
        directBaseUrl: ZPIKA_DIRECT_BASE_URL,
        apiKey: channel.apiKey,
        models: channel.models,
        imageModels: channel.imageModels,
        videoModels: channel.videoModels,
        textModels: channel.textModels,
        audioModels: channel.audioModels,
        model,
    };
}

export function applyPreferredModelsToChannel(channel: CustomAiChannel, fetchedModels: string[]): CustomAiChannel {
    const available = normalizeModelList(fetchedModels);
    const preferred = normalizeModelList(channel.preferredModels || []);
    const selected = preferred.filter((model) => available.includes(model));
    // Keep previously selected models that still exist, plus preferred hits.
    const retained = channel.models.filter((model) => available.includes(model));
    const nextModels = normalizeModelList([...retained, ...selected]);
    const usableModels = nextModels.length ? nextModels : selected;
    const patch: CustomAiChannel = {
        ...channel,
        models: usableModels,
        preferredModels: preferred,
    };
    if (channel.id === ZPIKA_GROUP_IDS.geminiImage || channel.id === ZPIKA_GROUP_IDS.openaiImage) {
        patch.imageModels = usableModels;
        patch.videoModels = [];
        patch.textModels = [];
        patch.audioModels = [];
    } else if (channel.id === ZPIKA_GROUP_IDS.video) {
        patch.videoModels = usableModels;
        patch.imageModels = [];
        patch.textModels = [];
        patch.audioModels = [];
    } else {
        patch.textModels = usableModels.filter((model) => !isAudioModelName(model));
        patch.audioModels = usableModels.filter((model) => isAudioModelName(model));
        patch.imageModels = [];
        patch.videoModels = [];
    }
    return patch;
}

export function preferredDefaultForChannel(channel: CustomAiChannel) {
    if (channel.id === ZPIKA_GROUP_IDS.geminiImage) return ZPIKA_DEFAULT_MODELS.geminiImage;
    if (channel.id === ZPIKA_GROUP_IDS.openaiImage) return ZPIKA_DEFAULT_MODELS.openaiImage;
    if (channel.id === ZPIKA_GROUP_IDS.video) return ZPIKA_DEFAULT_MODELS.video;
    return ZPIKA_DEFAULT_MODELS.text;
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    const userRole = useUserStore((state) => state.user?.role);
    const canUseLocalChannel = canUseCustomChannel(userRole, modelChannel?.allowCustomChannel === true);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel, canUseLocalChannel), [canUseLocalChannel, config, modelChannel]);
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
