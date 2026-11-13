export type ImageQualityOption = { value: string; label: string; priceTier?: "std" | "xhigh" };

export type ImageModelCapabilities = {
    qualityOptions: ImageQualityOption[];
    lockedResolution?: string;
    referenceLimit: number;
    supportsBackground: boolean;
    supportsGif: boolean;
    supportsMask: boolean;
    supportsOutputFormat: boolean;
    usesRatioSize: boolean;
    supportsExplicitDimensions: boolean;
    supportsAutoSize: boolean;
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
const FIXED_QUALITY_OPTIONS: ImageQualityOption[] = NATIVE_QUALITY_OPTIONS.map(({ value, label }) => ({ value, label }));
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
    const supersampling = /^gpt-image-2\.6-(?:flare|sunburst)$/.test(value);
    const isGeminiPreview = GEMINI_PREVIEW_MODELS.has(value);
    const isWeb = GPT_WEB_MODELS.has(value);
    const lockedResolution = nativeVariant?.[1]?.toUpperCase() || fixedVariant?.[1]?.toUpperCase();

    return {
        qualityOptions: isGeminiPreview ? GEMINI_QUALITY_OPTIONS : nativeVariant ? NATIVE_QUALITY_OPTIONS : fixedVariant ? FIXED_QUALITY_OPTIONS : lockedResolution || isWeb || supersampling ? [] : LEGACY_QUALITY_OPTIONS,
        lockedResolution: isWeb ? "Web · 最高约 1.5K" : supersampling ? "超分静图 · 按自身尺寸输出" : lockedResolution,
        referenceLimit: nativeVariant ? 16 : 9,
        supportsBackground: value.startsWith("gpt-image-2"),
        supportsGif: value === "gpt-image-2.6",
        supportsMask: value === "gpt-image-2",
        supportsOutputFormat: value === "gpt-image-2.6" || supersampling || Boolean(nativeVariant) || Boolean(fixedVariant),
        usesRatioSize: isGeminiPreview || value.startsWith("gpt-image-2"),
        supportsExplicitDimensions: !isWeb && !nativeVariant && !fixedVariant,
        supportsAutoSize: !nativeVariant && !fixedVariant,
    };
}

const GPT_IMAGE_TIER_SUFFIXES = ["-1k", "-2k", "-4k"] as const;

export function imageModelFamily(model: string) {
    const value = model.trim();
    const lower = value.toLowerCase();
    const tiered = GPT_IMAGE_TIER_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ? value.slice(0, -3) : value;
    return /^gpt-image-(?:2|2\.5|2\.6)(?:-(?:flare|sunburst))?$/i.test(tiered) ? tiered : value;
}

export function imageModelTier(model: string) {
    const value = model.trim().toLowerCase();
    if (value.endsWith("-1k")) return "1k";
    if (value.endsWith("-2k")) return "2k";
    if (value.endsWith("-4k")) return "4k";
    if (/^gpt-image-2\.6-(?:flare|sunburst)$/.test(value)) return "super-resolution";
    return "web";
}

export function imageModelFamilies(models: string[]) {
    return Array.from(new Set(models.map(imageModelFamily)));
}

export function imageModelTierOptions(model: string, models: string[]) {
    const family = imageModelFamily(model);
    if (!/^gpt-image-(?:2|2\.5|2\.6)(?:-(?:flare|sunburst))?$/i.test(family)) return [];
    const available = models.filter((item) => imageModelFamily(item) === family);
    return ["web", "super-resolution", "1k", "2k", "4k"].flatMap((tier) => {
        if ((tier === "web" || tier === "super-resolution") && imageModelTier(family) !== tier) return [];
        const candidate = tier === "web" || tier === "super-resolution" ? family : `${family}-${tier}`;
        return available.includes(candidate) ? [{ value: tier, model: candidate }] : [];
    });
}

export function selectImageModelFamily(family: string, models: string[], current = "") {
    if (imageModelFamily(current) === family && models.includes(current)) return current;
    const currentTier = imageModelTier(current);
    const matchingTier = currentTier === "1k" || currentTier === "2k" || currentTier === "4k" ? `${family}-${currentTier}` : family;
    if (models.includes(matchingTier)) return matchingTier;
    if (models.includes(family)) return family;
    return ["1k", "2k", "4k"].map((tier) => `${family}-${tier}`).find((model) => models.includes(model)) || family;
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
    if (capabilities.qualityOptions === NATIVE_QUALITY_OPTIONS || capabilities.qualityOptions === FIXED_QUALITY_OPTIONS) {
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

export function imageSettingsSummaryParts(model: string, quality: string) {
    const capabilities = getImageModelCapabilities(model);
    const value = model.trim().toLowerCase();
    const tier = imageModelTier(model);
    if (GPT_WEB_MODELS.has(value)) return { tier: "web", resolution: "最高约 1.5K", quality: "默认" };
    if (/^gpt-image-2\.6-(?:flare|sunburst)$/.test(value)) return { tier: "超分", resolution: "自身尺寸", quality: "默认" };
    if (tier === "1k" || tier === "2k" || tier === "4k") {
        return { tier: "", resolution: tier.toUpperCase(), quality: imageQualityLabelForModel(model, quality) };
    }
    return { tier: "", resolution: imageQualityLabelForModel(model, quality), quality: "默认" };
}
