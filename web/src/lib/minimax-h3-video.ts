import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export const MINIMAX_H3_MODEL = "MiniMax-H3";
export const MINIMAX_H3_REFERENCE_LIMITS = { images: 9, videos: 3, audios: 3, total: 12 } as const;

export const minimaxH3ResolutionOptions = [
    { value: "768P", label: "768P" },
    { value: "2K", label: "2K" },
] as const;

export const minimaxH3RatioOptions = [
    { value: "adaptive", label: "自适应" },
    { value: "21:9", label: "超宽屏" },
    { value: "16:9", label: "横屏" },
    { value: "4:3", label: "横屏 4:3" },
    { value: "1:1", label: "方形" },
    { value: "3:4", label: "竖屏 3:4" },
    { value: "9:16", label: "竖屏" },
] as const;

export type MiniMaxH3Payload = {
    model: typeof MINIMAX_H3_MODEL;
    prompt: string;
    duration: number;
    resolution: "768P" | "2K";
    aspect_ratio: (typeof minimaxH3RatioOptions)[number]["value"];
    reference_image_urls?: string[];
    reference_videos?: string[];
    reference_audios?: string[];
    first_image_url?: string;
    last_image_url?: string;
};

export function isMiniMaxH3VideoModel(model: string) {
    return model.trim().toLowerCase() === MINIMAX_H3_MODEL.toLowerCase();
}

export function normalizeMiniMaxH3Resolution(value: string): MiniMaxH3Payload["resolution"] {
    return value.trim().toLowerCase() === "2k" ? "2K" : "768P";
}

export function normalizeMiniMaxH3Duration(value: string) {
    return Math.max(4, Math.min(15, Math.floor(Number(value) || 5)));
}

export function normalizeMiniMaxH3Ratio(value: string): MiniMaxH3Payload["aspect_ratio"] {
    const normalized = value.trim().toLowerCase() === "auto" ? "adaptive" : value.trim();
    return minimaxH3RatioOptions.some((item) => item.value === normalized) ? (normalized as MiniMaxH3Payload["aspect_ratio"]) : "16:9";
}

export function buildMiniMaxH3Payload(input: {
    prompt: string;
    duration: string;
    resolution: string;
    ratio: string;
    images: Array<{ url: string; role?: ReferenceImage["seedanceRole"] }>;
    videos: string[];
    audios: string[];
}): MiniMaxH3Payload {
    const referenceImages = input.images.filter((item) => !item.role || item.role === "reference_image").map((item) => item.url);
    const firstImage = input.images.find((item) => item.role === "first_frame")?.url;
    const lastImage = input.images.find((item) => item.role === "last_frame")?.url;
    return {
        model: MINIMAX_H3_MODEL,
        prompt: input.prompt.trim(),
        duration: normalizeMiniMaxH3Duration(input.duration),
        resolution: normalizeMiniMaxH3Resolution(input.resolution),
        aspect_ratio: normalizeMiniMaxH3Ratio(input.ratio),
        ...(referenceImages.length ? { reference_image_urls: referenceImages } : {}),
        ...(input.videos.length ? { reference_videos: input.videos } : {}),
        ...(input.audios.length ? { reference_audios: input.audios } : {}),
        ...(firstImage ? { first_image_url: firstImage } : {}),
        ...(lastImage ? { last_image_url: lastImage } : {}),
    };
}

export function miniMaxH3ReferenceWarnings(images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const warnings: string[] = [];
    const first = images.some((item) => item.seedanceRole === "first_frame");
    const last = images.some((item) => item.seedanceRole === "last_frame");
    const ordinaryImages = images.filter((item) => !item.seedanceRole || item.seedanceRole === "reference_image").length;
    if (ordinaryImages > MINIMAX_H3_REFERENCE_LIMITS.images) warnings.push(`普通参考图超过 ${MINIMAX_H3_REFERENCE_LIMITS.images} 张`);
    if (videos.length > MINIMAX_H3_REFERENCE_LIMITS.videos) warnings.push(`参考视频超过 ${MINIMAX_H3_REFERENCE_LIMITS.videos} 个`);
    if (audios.length > MINIMAX_H3_REFERENCE_LIMITS.audios) warnings.push(`参考音频超过 ${MINIMAX_H3_REFERENCE_LIMITS.audios} 个`);
    if (images.length + videos.length + audios.length > MINIMAX_H3_REFERENCE_LIMITS.total) warnings.push(`参考素材合计超过 ${MINIMAX_H3_REFERENCE_LIMITS.total} 项`);
    if (last && !first) warnings.push("已设置尾帧但没有首帧");
    if ((first || last) && (ordinaryImages || videos.length || audios.length)) warnings.push("首尾帧与普通参考素材混用");
    if (audios.length && !images.length && !videos.length) warnings.push("音频参考没有同时提供图片或视频");
    return warnings;
}
