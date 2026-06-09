import axios from "axios";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};

type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };

type ImageTaskResponse = {
    id: string;
    status: "pending" | "success" | "failed";
    msg?: string;
    response?: ImageApiResponse;
};
type FpbrowserVideoImageResponse = {
    id: string;
    status?: string;
    error?: { message?: string };
    image_url?: string;
    url?: string;
    video_url?: string;
    metadata?: { result_urls?: unknown };
};
type ReferenceMediaUploadResponse = { id: string; url: string; mimeType: string; bytes: number };

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";
const IMAGE_TASK_POLL_MS = 2000;
const IMAGE_TASK_TIMEOUT_MS = 20 * 60 * 1000;
const FPBROWSER_VIDEO_IMAGE_MODELS = new Set(["nana-banana-2", "nana-banana-pro", "nana-banana-2-4k", "nana-banana-pro-4k", "gpt-image2-1k", "gpt-image2-2k", "gpt-image2-4k"]);

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    if (Math.max(w, h) / Math.min(w, h) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    return { width: w, height: h };
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error("图像尺寸的宽高必须是 16 的倍数，请调整尺寸");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("图像尺寸最长边不能超过 3840px，请调整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("图像总像素需在 655360 到 8294400 之间，请调整尺寸");
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
}

function resolveImageDataUrl(item: Record<string, unknown>) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/png;base64,${item.b64_json}`;
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

function parseImagePayload(payload: ImageApiResponse) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const images =
        payload.data
            ?.map(resolveImageDataUrl)
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; detail?: unknown; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.error?.message || readDetail(responseData?.detail) || readStatusError(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function readDetail(detail: unknown) {
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") return JSON.stringify(detail);
    return "";
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}：${status}` : fallback;
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void) {
    let deltaText = "";
    for (const eventBlock of chunk.split("\n\n")) {
        const data = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
        if (!data || data === "[DONE]") continue;
        const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content || "";
        deltaText += delta;
    }
    if (deltaText) onDelta(deltaText);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

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

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    if (isFpbrowserVideoImageModel(config.model)) {
        return requestFpbrowserVideoImageGeneration(config, prompt, [], { n, quality, size: requestSize });
    }
    const payload = {
        model: config.model,
        prompt: withSystemPrompt(config, prompt),
        n,
        ...(quality ? { quality } : {}),
        ...(requestSize ? { size: requestSize } : {}),
        response_format: "b64_json",
        output_format: IMAGE_OUTPUT_FORMAT,
    };
    try {
        const payloadData =
            config.channelMode === "remote"
                ? await requestRemoteImageTask(config, "/images/generations", payload, aiHeaders(config, "application/json"))
                : (await axios.post<ImageApiResponse>(aiApiUrl(config, "/images/generations"), payload, { headers: aiHeaders(config, "application/json") })).data;
        const images = parseImagePayload(payloadData);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    if (isFpbrowserVideoImageModel(config.model)) {
        if (mask) throw new Error("当前 fpbrowser2api 图片模型暂不支持蒙版编辑");
        return requestFpbrowserVideoImageGeneration(config, requestPrompt, references, { n, quality, size: requestSize });
    }
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withSystemPrompt(config, requestPrompt));
    formData.set("n", String(n));
    formData.set("response_format", "b64_json");
    formData.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set("size", requestSize);
    }
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", dataUrlToFile(mask));

    try {
        const payloadData =
            config.channelMode === "remote" ? await requestRemoteImageTask(config, "/images/edits", formData, aiHeaders(config)) : (await axios.post<ImageApiResponse>(aiApiUrl(config, "/images/edits"), formData, { headers: aiHeaders(config) })).data;
        const images = parseImagePayload(payloadData);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void) {
    let buffer = "";
    let answer = "";
    let processedLength = 0;

    try {
        const response = await axios.post(
            aiApiUrl(config, "/chat/completions"),
            {
                model: config.model,
                messages: withSystemMessage(config, messages),
                stream: true,
            },
            {
                headers: {
                    ...aiHeaders(config, "application/json"),
                } as Record<string, string>,
                responseType: "text",
                onDownloadProgress: (event) => {
                    const responseText = String(event.event?.target?.responseText || "");
                    const nextText = responseText.slice(processedLength);
                    processedLength = responseText.length;
                    buffer += nextText;
                    const chunks = buffer.split("\n\n");
                    buffer = chunks.pop() || "";
                    for (const chunk of chunks) {
                        parseStreamChunk(chunk, (delta) => {
                            answer += delta;
                            onDelta(answer);
                        });
                    }
                },
            },
        );
        if (typeof response.data === "object" && response.data && "code" in response.data && (response.data as { code?: number; msg?: string }).code !== 0) {
            throw new Error((response.data as { msg?: string }).msg || "请求失败");
        }
        if (typeof response.data === "string") {
            let apiError = "";
            try {
                const payload = JSON.parse(response.data) as { code?: number; msg?: string };
                if (typeof payload.code === "number" && payload.code !== 0) {
                    apiError = payload.msg || "请求失败";
                }
            } catch {
                // ignore plain text stream content
            }
            if (apiError) throw new Error(apiError);
        }
        if (buffer) {
            parseStreamChunk(buffer, (delta) => {
                answer += delta;
                onDelta(answer);
            });
        }
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
    refreshRemoteUser(config);
    return answer || "没有返回内容";
}

export async function fetchImageModels(config: AiConfig) {
    if (config.channelMode === "remote") return config.models;
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}

async function requestRemoteImageTask(config: AiConfig, path: "/images/generations" | "/images/edits", body: Record<string, unknown> | FormData, headers: ReturnType<typeof aiHeaders>) {
    const startedAt = Date.now();
    const created = unwrapEnvelope((await axios.post<ApiEnvelope<ImageTaskResponse>>(`/api/v1${path}/tasks`, body, { headers })).data, "生成任务创建失败");
    let task = created;

    while (Date.now() - startedAt < IMAGE_TASK_TIMEOUT_MS) {
        if (task.status === "success") {
            if (!task.response) throw new Error("生成任务没有返回图片");
            return task.response;
        }
        if (task.status === "failed") {
            refreshRemoteUser(config);
            throw new Error(task.msg || "生成失败");
        }
        await delay(IMAGE_TASK_POLL_MS);
        task = unwrapEnvelope((await axios.get<ApiEnvelope<ImageTaskResponse>>(`/api/v1/images/tasks/${encodeURIComponent(created.id)}`, { headers: aiHeaders(config) })).data, "生成任务不存在");
    }

    throw new Error("生成任务仍在进行，请稍后重试或减少生成张数");
}

function isFpbrowserVideoImageModel(model: string) {
    return FPBROWSER_VIDEO_IMAGE_MODELS.has(model.trim().toLowerCase());
}

async function requestFpbrowserVideoImageGeneration(config: AiConfig, prompt: string, references: ReferenceImage[], options: { n: number; quality?: string; size?: string }) {
    const referenceUrls = references.length ? await Promise.all(references.map(resolveFpbrowserImageReferenceUrl)) : [];
    const payload: Record<string, unknown> = {
        model: config.model,
        prompt: withSystemPrompt(config, prompt),
        duration: 1,
        n: Math.max(1, Math.min(4, options.n)),
        ...(options.quality ? { quality: options.quality, resolution: fpbrowserResolutionFromQuality(options.quality) } : {}),
        ...(options.size ? { size: options.size } : {}),
        ...(resolveFpbrowserAspectRatio(config.size) ? { aspect_ratio: resolveFpbrowserAspectRatio(config.size) } : {}),
        ...(referenceUrls.length ? { images: referenceUrls } : {}),
    };

    try {
        const created = unwrapEnvelope((await axios.post<ApiEnvelope<FpbrowserVideoImageResponse>>(aiApiUrl(config, "/videos"), payload, { headers: aiHeaders(config, "application/json") })).data, "图片任务创建失败");
        if (!created.id) throw new Error("图片任务没有返回任务 ID");
        const createdUrls = readFpbrowserVideoImageUrls(created);
        if (createdUrls.length) {
            refreshRemoteUser(config);
            return createdUrls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < IMAGE_TASK_TIMEOUT_MS) {
            await delay(IMAGE_TASK_POLL_MS);
            const task = unwrapEnvelope((await axios.get<ApiEnvelope<FpbrowserVideoImageResponse>>(aiApiUrl(config, `/videos/${created.id}`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model: config.model } : undefined })).data, "图片任务不存在");
            const urls = readFpbrowserVideoImageUrls(task);
            if (isFpbrowserCompletedStatus(task.status) && urls.length) {
                refreshRemoteUser(config);
                return urls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
            }
            if (isFpbrowserFailedStatus(task.status)) throw new Error(task.error?.message || "图片生成失败");
        }
        throw new Error("图片生成超时，请稍后重试");
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

async function resolveFpbrowserImageReferenceUrl(image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl)) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    const body = new FormData();
    body.append("file", dataUrlToFile({ ...image, dataUrl }), image.name || "reference.png");
    const token = useUserStore.getState().token;
    const response = await axios.post<ApiEnvelope<ReferenceMediaUploadResponse>>("/api/v1/media/references", body, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    const payload = unwrapEnvelope(response.data, "参考素材上传失败");
    if (!payload.url) throw new Error("参考素材上传后没有返回公网 URL");
    return payload.url;
}

function isPublicMediaUrl(value: string | undefined) {
    if (!value) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function fpbrowserResolutionFromQuality(quality: string) {
    if (quality === "high") return "4k";
    if (quality === "medium") return "2k";
    return "1k";
}

function resolveFpbrowserAspectRatio(size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return "";
    const dimensions = parseImageDimensions(value);
    if (dimensions) return reduceRatio(dimensions.width, dimensions.height);
    return value.includes(":") ? value : "";
}

function reduceRatio(width: number, height: number) {
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function gcd(a: number, b: number): number {
    return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function readFpbrowserVideoImageUrls(payload: FpbrowserVideoImageResponse) {
    const resultUrls = payload.metadata?.result_urls;
    return [payload.image_url, payload.url, ...(Array.isArray(resultUrls) ? resultUrls : [])].filter((url): url is string => typeof url === "string" && Boolean(url) && !url.match(/\.(mp4|mov|webm)(\?|$)/i));
}

function isFpbrowserCompletedStatus(status: string | undefined) {
    return status === "completed" || status === "succeeded" || status === "success";
}

function isFpbrowserFailedStatus(status: string | undefined) {
    return status === "failed" || status === "cancelled" || status === "expired";
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

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
