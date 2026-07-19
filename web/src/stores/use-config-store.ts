"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export type AiConfig = {
    channelMode: "remote" | "local";
    protocol: CustomChannelProtocol;
    baseUrl: string;
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
export const CONFIG_STORE_VERSION = 2;
export type ModelCapability = "image" | "video" | "text" | "audio";
export type CustomChannelProtocol = "openai" | "gemini" | "fpbrowser2api" | "zerofall";
export type CustomAiChannel = {
    id: string;
    name: string;
    protocol: CustomChannelProtocol;
    baseUrl: string;
    apiKey: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
};

const DEFAULT_CUSTOM_CHANNEL_ID = "custom-1";

const defaultCustomChannel: CustomAiChannel = {
    id: DEFAULT_CUSTOM_CHANNEL_ID,
    name: "渠道 1",
    protocol: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
};

export const defaultConfig: AiConfig = {
    channelMode: "remote",
    protocol: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "grok-imagine-video",
    textModel: "gpt-5.5",
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
    size: "1:1",
    count: "1",
    canvasImageCount: "1",
    customChannels: [defaultCustomChannel],
    imageChannelId: DEFAULT_CUSTOM_CHANNEL_ID,
    videoChannelId: DEFAULT_CUSTOM_CHANNEL_ID,
    textChannelId: DEFAULT_CUSTOM_CHANNEL_ID,
    audioChannelId: DEFAULT_CUSTOM_CHANNEL_ID,
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

export function migrateImageDefaults<T extends { quality?: string; size?: string }>(config: T, persistedVersion: number): T {
    if (persistedVersion >= CONFIG_STORE_VERSION || config.quality !== "auto" || config.size !== "1:1") return config;
    return { ...config, quality: "high" };
}

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
            value.includes("midjourney"))
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
    return Boolean((channel?.baseUrl || config.baseUrl).trim() && (channel?.apiKey || config.apiKey).trim());
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
                return { ...state, config: migrateImageDefaults(state.config || {}, version) };
            },
            partialize: (state) => ({ config: state.config }),
            merge: (persisted, current) => {
                const persistedConfig = ((persisted as Partial<ConfigStore>).config || {}) as Partial<AiConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                const customChannels = normalizeCustomChannels(persistedConfig.customChannels, persistedConfig);
                return {
                    ...current,
                    config: {
                        ...config,
                        channelMode: config.channelMode === "local" ? "local" : "remote",
                        protocol: normalizeCustomChannelProtocol(persistedConfig.protocol),
                        imageModel: config.imageModel || config.model,
                        videoModel: config.videoModel || "grok-imagine-video",
                        textModel: config.textModel || config.model,
                        audioModel: config.audioModel || defaultConfig.audioModel,
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSize: config.videoSize || defaultConfig.videoSize,
                        videoSeconds: config.videoSeconds || defaultConfig.videoSeconds,
                        vquality: config.vquality || defaultConfig.vquality,
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "1",
                        imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
                        videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
                        textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
                        audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
                        customChannels,
                        imageChannelId: normalizeCapabilityChannelId(config.imageChannelId, customChannels, "image"),
                        videoChannelId: normalizeCapabilityChannelId(config.videoChannelId, customChannels, "video"),
                        textChannelId: normalizeCapabilityChannelId(config.textChannelId, customChannels, "text"),
                        audioChannelId: normalizeCapabilityChannelId(config.audioChannelId, customChannels, "audio"),
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

function normalizeCustomChannels(channels: CustomAiChannel[] | undefined, legacy: Partial<AiConfig>): CustomAiChannel[] {
    const source =
        Array.isArray(channels) && channels.length
            ? channels
            : [
                  {
                      ...defaultCustomChannel,
                      protocol: normalizeCustomChannelProtocol(legacy.protocol),
                      baseUrl: legacy.baseUrl || defaultCustomChannel.baseUrl,
                      apiKey: legacy.apiKey || "",
                      models: legacy.models || [],
                      imageModels: legacy.imageModels || [],
                      videoModels: legacy.videoModels || [],
                      textModels: legacy.textModels || [],
                      audioModels: legacy.audioModels || [],
                  },
              ];
    const usedIds = new Set<string>();
    return source.map((channel, index) => {
        let id = String(channel.id || `custom-${index + 1}`).trim() || `custom-${index + 1}`;
        while (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);
        const models = normalizeModelList(channel.models || []);
        const protocol = normalizeCustomChannelProtocol(channel.protocol);
        return {
            id,
            name: String(channel.name || `渠道 ${index + 1}`).trim() || `渠道 ${index + 1}`,
            protocol,
            baseUrl: String(channel.baseUrl || "").trim(),
            apiKey: String(channel.apiKey || "").trim(),
            models,
            imageModels: normalizeModelList(channel.imageModels || []).filter((model) => models.includes(model)),
            videoModels: protocol === "gemini" ? [] : normalizeModelList(channel.videoModels || []).filter((model) => models.includes(model)),
            textModels: protocol === "gemini" ? [] : normalizeModelList(channel.textModels || []).filter((model) => models.includes(model)),
            audioModels: protocol === "gemini" ? [] : normalizeModelList(channel.audioModels || []).filter((model) => models.includes(model)),
        };
    });
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
    return channels.find((channel) => channel.id === value && channel[modelsKey].length)?.id || channels.find((channel) => channel[modelsKey].length)?.id || channels[0]?.id || "";
}

function resolveLocalEffectiveConfig(config: AiConfig): AiConfig {
    const channels = normalizeCustomChannels(config.customChannels, config);
    const models = normalizeModelList(channels.flatMap((channel) => channel.models));
    const next = { ...config, customChannels: channels, models };
    for (const capability of ["image", "video", "text", "audio"] as const) {
        const modelsKey = capabilityModelsKey(capability);
        const channelKey = capabilityChannelKey(capability);
        const modelKey = capabilityModelKey(capability);
        const capabilityModels = normalizeModelList(channels.flatMap((channel) => channel[modelsKey]));
        const channelId = normalizeCapabilityChannelId(config[channelKey], channels, capability);
        const preferredChannel = channels.find((channel) => channel.id === channelId);
        next[modelsKey] = capabilityModels;
        next[channelKey] = channelId;
        next[modelKey] = preferredChannel?.[modelsKey].includes(config[modelKey]) ? config[modelKey] : preferredChannel?.[modelsKey][0] || capabilityModels[0] || "";
    }
    return next;
}

export function resolveCustomChannelConfig(config: AiConfig, capability: ModelCapability, model = config.model): AiConfig {
    if (config.channelMode !== "local") return { ...config, model };
    const channels = normalizeCustomChannels(config.customChannels, config);
    const modelsKey = capabilityModelsKey(capability);
    const preferredId = config[capabilityChannelKey(capability)];
    const preferred = channels.find((channel) => channel.id === preferredId && channel[modelsKey].includes(model));
    const channel = preferred || channels.find((item) => item[modelsKey].includes(model));
    if (!channel) return { ...config, model };
    return {
        ...config,
        protocol: channel.protocol,
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        models: channel.models,
        imageModels: channel.imageModels,
        videoModels: channel.videoModels,
        textModels: channel.textModels,
        audioModels: channel.audioModels,
        model,
    };
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
