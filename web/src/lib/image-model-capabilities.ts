export type ImageQualityOption = { value: string; label: string; priceTier?: "std" | "xhigh" };

export type ImageModelCapabilities = {
    qualityOptions: ImageQualityOption[];
    lockedResolution?: string;
    referenceLimit: number;
    supportsBackground: boolean;
    supportsGif: boolean;
    supportsMask: boolean;
    usesRatioSize: boolean;
};

const GEMINI_PREVIEW_MODELS = new Set(["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]);
const GPT_WEB_MODELS = new Set(["gpt-image-2", "gpt-image-2.5", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-2.6"]);
const GEMINI_QUALITY_OPTIONS: ImageQualityOption[] = [
    { value: "1k", label: "1K" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
];
const NATIVE_QUALITY_OPTIONS: ImageQualityOption[] = [
    { value: "low", label: "Low", priceTier: "std" },
    { value: "medium", label: "Medium", priceTier: "std" },
    { value: "high", label: "High", priceTier: "std" },
    { value: "xhigh", label: "XHigh", priceTier: "xhigh" },
    { value: "max", label: "Max", priceTier: "xhigh" },
];
const LEGACY_QUALITY_OPTIONS: ImageQualityOption[] = [
    { value: "high", label: "4K" },
    { value: "medium", label: "2K" },
    { value: "low", label: "1K" },
    { value: "auto", label: "自动" },
];

export function getImageModelCapabilities(model: string): ImageModelCapabilities {
    const value = model.trim().toLowerCase();
    const nativeVariant = value.match(/^gpt-image-(?:2\.5|2\.6)-(?:flare|sunburst)-(1k|2k|4k)$/);
    const fixedVariant = value.match(/^gpt-image-2-(1k|2k|4k)$/);
    const isGeminiPreview = GEMINI_PREVIEW_MODELS.has(value);
    const isWeb = GPT_WEB_MODELS.has(value);
    const lockedResolution = nativeVariant?.[1]?.toUpperCase() || fixedVariant?.[1]?.toUpperCase();

    return {
        qualityOptions: isGeminiPreview ? GEMINI_QUALITY_OPTIONS : nativeVariant ? NATIVE_QUALITY_OPTIONS : lockedResolution || isWeb ? [] : LEGACY_QUALITY_OPTIONS,
        lockedResolution: isWeb ? "最高约 1.5K" : lockedResolution,
        referenceLimit: nativeVariant ? 16 : 9,
        supportsBackground: isWeb,
        supportsGif: value === "gpt-image-2.6" || /^gpt-image-2\.6-(?:flare|sunburst)-(?:1k|2k|4k)$/.test(value),
        supportsMask: value === "gpt-image-2",
        usesRatioSize: isGeminiPreview || isWeb || Boolean(nativeVariant) || Boolean(fixedVariant),
    };
}

export function normalizeImageQualityForModel(model: string, quality: string) {
    const capabilities = getImageModelCapabilities(model);
    if (!capabilities.qualityOptions.length) return undefined;
    const value = quality.trim().toLowerCase();
    if (GEMINI_PREVIEW_MODELS.has(model.trim().toLowerCase())) {
        if (value === "4k" || value === "high") return "4k";
        if (value === "2k" || value === "medium" || value === "hd") return "2k";
        return "1k";
    }
    if (capabilities.qualityOptions === NATIVE_QUALITY_OPTIONS) {
        if (["low", "medium", "high", "xhigh", "max"].includes(value)) return value;
        if (value === "1k") return "low";
        if (value === "2k") return "medium";
        return "high";
    }
    if (["low", "medium", "high"].includes(value)) return value;
    if (value === "1k") return "low";
    if (value === "2k") return "medium";
    if (value === "4k") return "high";
    return undefined;
}

export function imageQualityLabelForModel(model: string, quality: string) {
    const capabilities = getImageModelCapabilities(model);
    if (!capabilities.qualityOptions.length) return capabilities.lockedResolution || "模型默认";
    const normalized = normalizeImageQualityForModel(model, quality) || quality;
    return capabilities.qualityOptions.find((option) => option.value === normalized)?.label || normalized;
}
