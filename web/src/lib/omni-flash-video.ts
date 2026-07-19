/** ZeroFall omni-flash / omni-flash-vref helpers (https://llmdocs.zerofall.top/#/video) */

export const OMNI_FLASH_GENERATE_MODEL = "omni-flash";
export const OMNI_FLASH_EDIT_MODEL = "omni-flash-vref";

export const OMNI_FLASH_REFERENCE_LIMITS = {
    generateImages: 7,
    editImages: 5,
    editVideos: 1,
    videoMaxSeconds: 30,
} as const;

export const omniFlashDurationOptions = [4, 6, 8, 10] as const;
export const omniFlashResolutionOptions = [
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
] as const;

export function isOmniFlashVideoModel(model: string) {
    const value = model.trim().toLowerCase();
    return value === OMNI_FLASH_GENERATE_MODEL || value === OMNI_FLASH_EDIT_MODEL || value.startsWith("omni-flash");
}

export function isOmniFlashEditModel(model: string) {
    return model.trim().toLowerCase() === OMNI_FLASH_EDIT_MODEL;
}

/** Prefer edit model when a reference video is present. */
export function resolveOmniFlashModel(model: string, hasReferenceVideo: boolean) {
    if (!isOmniFlashVideoModel(model)) return model.trim();
    if (hasReferenceVideo) return OMNI_FLASH_EDIT_MODEL;
    if (isOmniFlashEditModel(model)) return OMNI_FLASH_EDIT_MODEL;
    return OMNI_FLASH_GENERATE_MODEL;
}

/**
 * Map UI size / ratio values to ZeroFall aspect_ratio.
 * 16:9 / landscape / wider frames → landscape; 9:16 / portrait / taller → portrait.
 */
export function normalizeOmniFlashAspectRatio(size: string, videoWidth?: number, videoHeight?: number): "landscape" | "portrait" {
    const w = Math.round(Number(videoWidth) || 0);
    const h = Math.round(Number(videoHeight) || 0);
    if (w > 0 && h > 0) return w >= h ? "landscape" : "portrait";

    const raw = String(size || "").trim().toLowerCase();
    if (!raw) return "portrait";
    if (raw === "auto" || raw === "adaptive") return "landscape";
    if (raw === "landscape" || raw.includes("横")) return "landscape";
    if (raw === "portrait" || raw.includes("竖")) return "portrait";
    if (raw.includes("16:9") || raw.includes("21:9") || raw.includes("4:3") || raw.includes("3:2")) return "landscape";
    if (raw.includes("9:16") || raw.includes("3:4") || raw.includes("2:3")) return "portrait";

    const match = raw.match(/^(\d+)\s*[xX*×]\s*(\d+)$/);
    if (match) {
        const width = Number(match[1]);
        const height = Number(match[2]);
        if (width > 0 && height > 0) return width >= height ? "landscape" : "portrait";
    }
    return "landscape";
}

/** Map UI quality (720 / 720p / high / 1080…) to ZeroFall resolution. */
export function normalizeOmniFlashResolution(value: string): "720p" | "1080p" {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "1080p";
    if (raw === "1080" || raw === "1080p" || raw === "high" || raw.includes("1080")) return "1080p";
    return "720p";
}

/** Generate mode: 4 / 6 / 8 / 10. Edit mode is fixed to 10. */
export function normalizeOmniFlashDuration(value: string, isEdit: boolean): 4 | 6 | 8 | 10 {
    if (isEdit) return 10;
    if (!String(value).trim()) return 10;
    const seconds = Math.floor(Number(value) || 0);
    if (seconds <= 4) return 4;
    if (seconds <= 6) return 6;
    if (seconds <= 8) return 8;
    return 10;
}
