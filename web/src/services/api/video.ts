import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string } };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type VeoOmniTask = {
    id?: string;
    task_id?: string;
    status?: string;
    state?: string;
    task_status?: string;
    progress?: number;
    error?: { code?: string; message?: string } | null;
    error_message?: string;
    msg?: string;
    message?: string;
    video_url?: string | null;
    image_url?: string | null;
    url?: string | null;
    content?: { video_url?: string; image_url?: string; url?: string } | null;
    metadata?: { result_urls?: unknown } | null;
    result?: unknown;
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type ReferenceMediaUploadResponse = { id: string; url: string; mimeType: string; bytes: number };
type VeoOmniPayload = {
    model: string;
    prompt: string;
    aspect_ratio: "16:9" | "9:16";
    duration: 10;
    width: number;
    height: number;
    video_width: number;
    video_height: number;
    video_url?: string;
    Ingredients_images?: string[];
};
type VeoOmniPayloadVideo = { url?: string; width?: number; height?: number };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };

function aiApiUrl(config: AiConfig, path: string) {
    return config.channelMode === "remote" ? `/api/v1${path}` : buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    const token = useUserStore.getState().token;
    return config.channelMode === "remote"
        ? {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(contentType ? { "Content-Type": contentType } : {}),
          }
        : {
              Authorization: `Bearer ${config.apiKey}`,
              ...(contentType ? { "Content-Type": contentType } : {}),
          };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = []): Promise<VideoGenerationResult> {
    const model = (config.model || config.videoModel).trim();
    assertVideoConfig(config, model);
    if (isSeedanceVideoConfig({ ...config, model })) {
        return requestSeedanceGeneration(config, model, prompt, references, videoReferences, audioReferences);
    }
    if (isVeoOmniVideoModel(model)) {
        return requestVeoOmniGeneration(config, model, prompt, references, videoReferences, audioReferences);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考素材");
    }
    return requestOpenAIVideoGeneration(config, model, prompt, references);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
    throw new Error("视频接口没有返回可播放的视频");
}

async function requestOpenAIVideoGeneration(config: AiConfig, model: string, prompt: string, references: ReferenceImage[]) {
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config) })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${created.id}`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model } : undefined })).data);
            if (video.status === "completed") break;
            if (video.status === "failed" || video.status === "cancelled") throw new Error(video.error?.message || "视频生成失败");
            if (attempt === 119) throw new Error("视频生成超时，请稍后重试");
            await delay(2500);
        }
        const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${created.id}/content`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model } : undefined, responseType: "blob" });
        await assertVideoBlob(content.data);
        refreshRemoteUser(config);
        return { blob: content.data };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频生成失败"));
    }
}

async function requestSeedanceGeneration(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model,
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, model),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json") })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const task = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, created.id), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model } : undefined })).data);
            if (task.status === "succeeded") {
                const url = task.content?.video_url;
                if (!url) throw new Error("Seedance 任务成功但没有返回视频 URL");
                refreshRemoteUser(config);
                return videoResultFromUrl(url);
            }
            if (task.status === "failed" || task.status === "cancelled" || task.status === "expired") throw new Error(task.error?.message || `Seedance 视频生成${task.status === "expired" ? "超时" : "失败"}`);
            if (attempt === 119) throw new Error("Seedance 视频生成超时，请稍后重试");
            await delay(5000);
        }
        throw new Error("Seedance 视频生成超时，请稍后重试");
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 视频生成失败"));
    }
}

async function requestVeoOmniGeneration(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    if (audioReferences.length) throw new Error("Veo Omni Flash 不支持参考音频，请移除参考音频");
    if (videoReferences.length > 1) throw new Error("Veo Omni Flash Video Edit 目前只支持 1 个参考视频");
    if (isVeoOmniVideoEditModel(model) && !videoReferences.length) throw new Error("Veo Omni Flash Video Edit 需要连接 1 个参考视频");
    const imageUrls = await Promise.all(references.slice(0, 3).map((image) => resolveSeedanceImageUrl(config, image)));
    const videoUrls = await Promise.all(videoReferences.slice(0, 1).map((video) => resolveSeedanceVideoUrl(video)));
    const payload = buildVeoOmniPayload(
        config,
        model,
        prompt,
        imageUrls,
        videoReferences.slice(0, 1).map((video, index) => ({ url: videoUrls[index], width: video.width, height: video.height })),
    );

    try {
        const created = unwrapVeoOmniTask((await axios.post<ApiEnvelope<VeoOmniTask>>(aiApiUrl(config, "/videos"), payload, { headers: aiHeaders(config, "application/json") })).data);
        const taskId = veoOmniTaskId(created);
        if (!taskId) throw new Error("Veo Omni 接口没有返回任务 ID");
        const createdUrl = veoOmniTaskUrl(created);
        if (isVeoOmniCompleted(created) && createdUrl) {
            refreshRemoteUser(config);
            return videoResultFromUrl(createdUrl);
        }
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const task = unwrapVeoOmniTask((await axios.get<ApiEnvelope<VeoOmniTask>>(aiApiUrl(config, `/videos/${taskId}`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model: payload.model } : undefined })).data);
            if (isVeoOmniCompleted(task)) {
                const url = veoOmniTaskUrl(task);
                if (!url) throw new Error("Veo Omni 任务成功但没有返回视频 URL");
                refreshRemoteUser(config);
                return videoResultFromUrl(url);
            }
            if (isVeoOmniFailed(task)) throw new Error(veoOmniTaskError(task) || "Veo Omni 视频生成失败");
            if (attempt === 119) throw new Error("Veo Omni 视频生成超时，请稍后重试");
            await delay(5000);
        }
        throw new Error("Veo Omni 视频生成超时，请稍后重试");
    } catch (error) {
        throw new Error(readAxiosError(error, "Veo Omni 视频生成失败"));
    }
}

export function isVeoOmniVideoModel(model: string) {
    return isVeoOmniVideoEditModel(model) || model.trim().toLowerCase() === "veo-omni-flash";
}

function isVeoOmniVideoEditModel(model: string) {
    return model.trim().toLowerCase() === "veo-omni-flash-video-edit";
}

export function buildVeoOmniPayload(config: Pick<AiConfig, "size">, model: string, prompt: string, imageUrls: string[], videoReferences: VeoOmniPayloadVideo[]): VeoOmniPayload {
    const dimensions = veoOmniDimensions(config.size, videoReferences[0]);
    const images = imageUrls.map((url) => url.trim()).filter(Boolean).slice(0, 3);
    const videoUrl = String(videoReferences[0]?.url || "").trim();
    return {
        model: videoUrl ? "veo-omni-flash-video-edit" : model,
        prompt: buildVeoOmniPromptText(prompt, images.length, videoUrl ? 1 : 0),
        aspect_ratio: dimensions.width > dimensions.height ? "16:9" : "9:16",
        duration: 10,
        width: dimensions.width,
        height: dimensions.height,
        video_width: dimensions.width,
        video_height: dimensions.height,
        ...(videoUrl ? { video_url: videoUrl } : {}),
        ...(images.length ? { Ingredients_images: images } : {}),
    };
}

function buildVeoOmniPromptText(prompt: string, imageCount: number, videoCount: number) {
    const labels: string[] = [];
    if (videoCount) labels.push("视频1");
    if (imageCount) labels.push(Array.from({ length: imageCount }, (_, index) => `图片${index + 1}`).join("、"));
    const text = prompt.trim();
    if (!labels.length) return text;
    return `参考素材编号：${labels.join("、")}。请按这些编号理解提示词中的参考视频和参考图。\n\n${text}`;
}

function veoOmniDimensions(size: string, video?: VeoOmniPayloadVideo) {
    const videoDimensions = normalizePositiveDimensions(video?.width, video?.height);
    if (videoDimensions) return videoDimensions;
    const sizeDimensions = parseVeoOmniSizeDimensions(size);
    if (sizeDimensions) return sizeDimensions.width > sizeDimensions.height ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
    const lower = String(size || "").trim().toLowerCase();
    if (lower.includes("16:9") || lower.includes("landscape") || lower.includes("横")) return { width: 1920, height: 1080 };
    if (lower.includes("9:16") || lower.includes("portrait") || lower.includes("竖")) return { width: 1080, height: 1920 };
    return { width: 1080, height: 1920 };
}

function normalizePositiveDimensions(width?: number, height?: number) {
    const w = Math.round(Number(width) || 0);
    const h = Math.round(Number(height) || 0);
    return w > 0 && h > 0 ? { width: w, height: h } : null;
}

function parseVeoOmniSizeDimensions(size: string) {
    const match = String(size || "").match(/(\d+)\s*[xX*×]\s*(\d+)/);
    if (!match) return null;
    return normalizePositiveDimensions(Number(match[1]), Number(match[2]));
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    if (config.channelMode === "remote") return taskId ? `/api/v1/videos/${encodeURIComponent(taskId)}` : "/api/v1/videos";
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    if (config.channelMode === "remote") {
        return uploadReferenceMedia(dataUrlToFile({ ...image, dataUrl }));
    }
    return dataUrl;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    const file = new File([blob], video.name || "reference-video.mp4", { type: video.type || blob.type || "video/mp4" });
    return uploadReferenceMedia(file);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    const file = new File([blob], audio.name || "reference-audio.mp3", { type: audio.type || blob.type || "audio/mpeg" });
    return uploadReferenceMedia(file);
}

async function uploadReferenceMedia(file: File) {
    const token = useUserStore.getState().token;
    if (!token) throw new Error("使用本地参考素材需要先登录，并在服务端配置 PUBLIC_BASE_URL");
    const body = new FormData();
    body.append("file", file, file.name);
    const response = await axios.post<ApiEnvelope<ReferenceMediaUploadResponse>>("/api/v1/media/references", body, { headers: { Authorization: `Bearer ${token}` } });
    const payload = unwrapEnvelope(response.data, "参考素材上传失败");
    if (!payload.url) throw new Error("参考素材上传后没有返回公网 URL");
    return payload.url;
}

async function videoResultFromUrl(url: string): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob" });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch {
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (config.channelMode === "local" && !config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (config.channelMode === "local" && !config.apiKey.trim()) throw new Error("请先配置 API Key");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapVeoOmniTask(payload: ApiEnvelope<VeoOmniTask>) {
    return unwrapEnvelope(payload, "Veo Omni 接口没有返回任务");
}

function veoOmniTaskId(task: VeoOmniTask) {
    return String(task.id || task.task_id || "").trim();
}

function veoOmniTaskStatus(task: VeoOmniTask) {
    const status = String(task.status || task.state || task.task_status || "").trim().toLowerCase();
    if (status === "succeeded" || status === "success") return "completed";
    if (status === "running") return "processing";
    return status;
}

function isVeoOmniCompleted(task: VeoOmniTask) {
    return veoOmniTaskStatus(task) === "completed";
}

function isVeoOmniFailed(task: VeoOmniTask) {
    return ["failed", "cancelled", "canceled", "expired"].includes(veoOmniTaskStatus(task));
}

function veoOmniTaskUrl(task: VeoOmniTask): string {
    return firstMediaUrl([task.video_url, task.url, task.image_url, task.content?.video_url, task.content?.url, task.content?.image_url, task.metadata?.result_urls, task.result]);
}

function veoOmniTaskError(task: VeoOmniTask) {
    return task.error?.message || task.error_message || task.msg || task.message;
}

function firstMediaUrl(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return isPublicMediaUrl(value) ? value.trim() : "";
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = firstMediaUrl(item);
            if (url) return url;
        }
        return "";
    }
    if (typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    for (const key of ["video_url", "url", "share_url", "image_url"]) {
        const url = firstMediaUrl(record[key]);
        if (url) return url;
    }
    for (const item of Object.values(record)) {
        const url = firstMediaUrl(item);
        if (url) return url;
    }
    return "";
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; detail?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.detail || responseData?.error?.message || statusMessage(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
