import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export const SEEDANCE_REFERENCE_LIMITS = {
    imageMaxBytes: 30 * 1024 * 1024,
    videoMaxBytes: 50 * 1024 * 1024,
    audioMaxBytes: 15 * 1024 * 1024,
};

export type SeedanceReferenceCounts = { images: number; videos: number; audios: number };
export type SeedanceReferenceCountLimits = SeedanceReferenceCounts & { total: number };

const seedance20ReferenceLimits: SeedanceReferenceCountLimits = { images: 9, videos: 3, audios: 3, total: 15 };
const seedance25ReferenceLimits: SeedanceReferenceCountLimits = { images: 30, videos: 10, audios: 10, total: 50 };

export const seedanceResolutionOptions = [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
    { value: "4k", label: "4K" },
] as const;

export const seedanceRatioOptions = [
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "1:1", label: "方形" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
    { value: "21:9", label: "宽银幕" },
    { value: "adaptive", label: "自适应" },
] as const;

const seedanceStandardDurationOptions = [4, 5, 6, 8, 10, 12, 15] as const;
const seedanceExtendedDurationOptions = [...seedanceStandardDurationOptions, 20, 25, 30] as const;
const seedanceDatedModels = new Set(["doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128", "doubao-seedance-2-0-mini-260615", "doubao-seedance-2-5-260628"]);
const seedanceFrameRatios = [
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["21:9", 21 / 9],
] as const;

const seedancePixels = {
    "480p": {
        "16:9": "864x496",
        "4:3": "752x560",
        "1:1": "640x640",
        "3:4": "560x752",
        "9:16": "496x864",
        "21:9": "992x432",
    },
    "720p": {
        "16:9": "1280x720",
        "4:3": "1112x834",
        "1:1": "960x960",
        "3:4": "834x1112",
        "9:16": "720x1280",
        "21:9": "1470x630",
    },
    "1080p": {
        "16:9": "1920x1080",
        "4:3": "1664x1248",
        "1:1": "1440x1440",
        "3:4": "1248x1664",
        "9:16": "1080x1920",
        "21:9": "2206x946",
    },
    "4k": {
        "16:9": "3840x2160",
        "4:3": "3328x2496",
        "1:1": "2880x2880",
        "3:4": "2496x3328",
        "9:16": "2160x3840",
        "21:9": "4412x1892",
    },
} as const;

export function isSeedanceVideoConfig(config: Pick<AiConfig, "model" | "videoModel" | "baseUrl">) {
    return isSeedanceVideoModel(config.model || config.videoModel) || isArkPlanBaseUrl(config.baseUrl);
}

export function isSeedanceVideoModel(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("doubao-seedance");
}

export function isSeedanceFastModel(model: string) {
    const value = model.toLowerCase();
    return isSeedanceVideoModel(value) && value.includes("fast");
}

export function isSeedanceMiniModel(model: string) {
    const value = model.toLowerCase();
    return isSeedanceVideoModel(value) && value.includes("mini");
}

export function isSeedance25Model(model: string) {
    const value = model.toLowerCase();
    return isSeedanceVideoModel(value) && (value.includes("seedance-2-5") || value.includes("seedance-2.5"));
}

export function isSeedance20FullModel(model: string) {
    const value = model.toLowerCase();
    return isSeedanceVideoModel(value) && !isSeedanceFastModel(value) && !isSeedanceMiniModel(value) && (value.includes("seedance-2-0") || value.includes("seedance-2.0"));
}

export function seedanceReferenceLimitsForModel(model: string): SeedanceReferenceCountLimits {
    return isSeedance25Model(model) ? seedance25ReferenceLimits : seedance20ReferenceLimits;
}

export function seedanceReferenceCountError(model: string, counts: SeedanceReferenceCounts) {
    const limits = seedanceReferenceLimitsForModel(model);
    if (counts.images > limits.images) return `${model || "当前 Seedance 模型"} 最多支持 ${limits.images} 张参考图片（首尾帧计入图片数量）`;
    if (counts.videos > limits.videos) return `${model || "当前 Seedance 模型"} 最多支持 ${limits.videos} 个参考视频`;
    if (counts.audios > limits.audios) return `${model || "当前 Seedance 模型"} 最多支持 ${limits.audios} 个参考音频`;
    if (counts.images + counts.videos + counts.audios > limits.total) return `${model || "当前 Seedance 模型"} 最多支持 ${limits.total} 项参考素材`;
    return "";
}

export function isArkPlanBaseUrl(baseUrl: string) {
    return baseUrl.toLowerCase().includes("ark.cn-beijing.volces.com/api/plan/v3") || baseUrl.toLowerCase().includes("/api/plan/v3");
}

export function normalizeSeedanceResolution(value: string, model = "") {
    const normalized = normalizeResolutionToken(value);
    const options = seedanceResolutionOptionsForModel(model);
    if (options.some((item) => item.value === normalized)) return normalized;
    return isSeedanceFastModel(model) || isSeedanceMiniModel(model) ? "720p" : "1080p";
}

export function normalizeResolutionToken(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    if (/^4k$/i.test(String(value || ""))) return "4k";
    const resolution = String(value || "").replace(/p$/i, "") || "1080";
    return `${resolution}p`;
}

export function seedanceResolutionOptionsForModel(model: string) {
    if (isSeedanceFastModel(model) || isSeedanceMiniModel(model)) return seedanceResolutionOptions.filter((item) => item.value === "480p" || item.value === "720p");
    if (isSeedance25Model(model)) return seedanceResolutionOptions.filter((item) => item.value !== "4k");
    if (isSeedance20FullModel(model)) return seedanceResolutionOptions;
    return seedanceResolutionOptions.filter((item) => item.value !== "4k");
}

export function seedanceDurationOptionsForModel(model: string) {
    if (isSeedance25Model(model)) return seedanceExtendedDurationOptions;
    if (seedanceDatedModels.has(model.toLowerCase())) return seedanceStandardDurationOptions;
    return [-1, ...seedanceStandardDurationOptions] as const;
}

export function seedanceMaxDuration(model: string) {
    return isSeedance25Model(model) ? 30 : 15;
}

export function normalizeSeedanceDuration(value: string, model = "") {
    if (String(value).trim() === "-1" && !isSeedance25Model(model) && !seedanceDatedModels.has(model.toLowerCase())) return -1;
    const seconds = Math.floor(Number(value) || 5);
    return Math.max(4, Math.min(seedanceMaxDuration(model), seconds));
}

export function normalizeSeedanceRatio(value: string) {
    if (!value) return "16:9";
    if (value === "auto" || value === "adaptive") return "adaptive";
    if (seedanceRatioOptions.some((item) => item.value === value)) return value;
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return "adaptive";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "adaptive";
    const ratio = width / height;
    const options = [
        ["16:9", 16 / 9],
        ["4:3", 4 / 3],
        ["1:1", 1],
        ["3:4", 3 / 4],
        ["9:16", 9 / 16],
        ["21:9", 21 / 9],
    ] as const;
    return options.reduce((best, item) => (Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best), options[0])[0];
}

export function seedanceFrameRatio(model: string, images: ReferenceImage[], fallback: string) {
    const firstFrame = images.find((image) => image.seedanceRole === "first_frame");
    if (!firstFrame) return normalizeSeedanceRatio(fallback);
    if (isSeedance25Model(model)) return "adaptive";
    return firstFrame.width && firstFrame.height ? closestSeedanceFrameRatio(firstFrame.width, firstFrame.height) || normalizeSeedanceRatio(fallback) : normalizeSeedanceRatio(fallback);
}

export function seedanceFrameReferenceError(images: ReferenceImage[]) {
    const firstFrame = images.find((image) => image.seedanceRole === "first_frame");
    const lastFrame = images.find((image) => image.seedanceRole === "last_frame");
    if (!firstFrame) return "";
    if (!firstFrame.width || !firstFrame.height) return "无法读取 Seedance 首帧尺寸，请重新上传图片后再试";
    const ratio = closestSeedanceFrameRatio(firstFrame.width, firstFrame.height);
    if (!ratio) return `Seedance 首帧尺寸 ${firstFrame.width}x${firstFrame.height} 不属于支持的比例，请先使用图片节点的“裁剪”生成 16:9、9:16、1:1、4:3、3:4 或 21:9 图片`;
    if (!lastFrame) return "";
    if (!lastFrame.width || !lastFrame.height) return "无法读取 Seedance 尾帧尺寸，请重新上传图片后再试";
    if (firstFrame.width !== lastFrame.width || firstFrame.height !== lastFrame.height) {
        return `Seedance 首尾帧尺寸必须一致，当前为 ${firstFrame.width}x${firstFrame.height} 和 ${lastFrame.width}x${lastFrame.height}；请先使用图片节点的“裁剪”生成相同尺寸的新图片`;
    }
    if (closestSeedanceFrameRatio(lastFrame.width, lastFrame.height) !== ratio) return "Seedance 首尾帧比例必须一致，请先裁剪为相同比例";
    return "";
}

function closestSeedanceFrameRatio(width: number, height: number) {
    const value = width / height;
    const closest = seedanceFrameRatios.reduce((best, item) => (Math.abs(item[1] - value) < Math.abs(best[1] - value) ? item : best), seedanceFrameRatios[0]);
    return Math.abs(closest[1] - value) / closest[1] <= 0.015 ? closest[0] : "";
}

export function seedancePixelLabel(resolution: string, ratio: string, model = "") {
    const normalizedResolution = normalizeSeedanceResolution(resolution, model) as keyof typeof seedancePixels;
    const normalizedRatio = normalizeSeedanceRatio(ratio) as keyof (typeof seedancePixels)[typeof normalizedResolution] | "adaptive";
    if (normalizedRatio === "adaptive") return "自动匹配";
    return seedancePixels[normalizedResolution][normalizedRatio] || "";
}

export function boolConfig(value: string | undefined, fallback: boolean) {
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
}

export function seedanceReferenceLabel(kind: "image" | "video" | "audio", index: number) {
    if (kind === "image") return `图片${index + 1}`;
    if (kind === "video") return `视频${index + 1}`;
    return `音频${index + 1}`;
}

export function buildSeedancePromptText(prompt: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const labels = [
        ...images.map((_, index) => seedanceReferenceLabel("image", index)),
        ...videos.map((_, index) => seedanceReferenceLabel("video", index)),
        ...audios.map((_, index) => seedanceReferenceLabel("audio", index)),
    ];
    const text = prompt.trim();
    if (!labels.length) return text;
    return `参考素材编号：${labels.join("、")}。请按这些编号理解提示词中的图片、视频和音频引用。\n\n${text}`;
}

export function seedanceVideoReferenceError(videos: ReferenceVideo[]) {
    let totalDurationMs = 0;
    for (let index = 0; index < videos.length; index += 1) {
        const video = videos[index];
        const label = seedanceReferenceLabel("video", index);
        if (video.bytes && video.bytes > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) return `${label} 超过 50MB，请压缩后再上传`;
        if (video.durationMs) {
            if (video.durationMs < 2000 || video.durationMs > 15000) return `${label} 时长需要在 2-15 秒之间`;
            totalDurationMs += video.durationMs;
        }
        if (video.width && video.height) {
            if (video.width < 300 || video.width > 6000 || video.height < 300 || video.height > 6000) return `${label} 宽高需要在 300-6000px 之间`;
            const ratio = video.width / video.height;
            if (ratio < 0.4 || ratio > 2.5) return `${label} 宽高比需要在 0.4-2.5 之间`;
            const pixels = video.width * video.height;
            if (pixels < 640 * 640 || pixels > 2206 * 946) return `${label} 像素总量不符合 Seedance 要求，请转成 480p/720p/1080p 后再上传`;
        }
    }
    if (totalDurationMs > 15000) return "Seedance 参考视频总时长不能超过 15 秒";
    return "";
}

export const seedanceVideoReferenceHint = "参考视频需为 mp4/mov，H.264/H.265，FPS 24-60；含真人人脸素材请使用火山授权 asset:// 素材。";
