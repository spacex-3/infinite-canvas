import axios from "axios";

import { assertChannelSupportsCapability, buildApiUrl, resolveCustomChannelConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { nanoid } from "nanoid";
import { resolveSemanticImageDimensions, type ImageResolutionLimits } from "@/lib/image-resolution";
import { getImageModelCapabilities, normalizeImageQualityForModel } from "@/lib/image-model-capabilities";
import { dataUrlToFile } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import { buildGeminiApiUrl, buildGeminiImagePayload, buildGeminiModelsUrl, parseGeminiImagePayload, parseGeminiModels, readGeminiDataUrl } from "./gemini-image";
import { notifyGenerationProgress, type GenerationProgressCallback } from "./progress";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ImageApiResponse = {
    id?: string;
    status?: string;
    progress?: number;
    data?: Array<Record<string, unknown>>;
    candidates?: unknown[];
    error?: { message?: string };
    code?: number;
    msg?: string;
};

type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };

type ImageTaskResponse = {
    id: string;
    status: "pending" | "success" | "failed";
    progress?: number;
    msg?: string;
    response?: ImageApiResponse;
};
export type ImageTaskRecovery = {
    taskId: string;
    protocol?: "canvas" | "upstream";
    path?: "/images/generations" | "/images/edits";
    status: "submitted" | "completed" | "failed";
    resultUrl?: string;
};
export type ImageTaskRecoveryCallback = (recovery: ImageTaskRecovery) => void;
type FpbrowserVideoImageResponse = {
    id: string;
    status?: string;
    progress?: number;
    error?: { message?: string };
    image_url?: string;
    url?: string;
    video_url?: string;
    metadata?: { result_urls?: unknown };
};
type ReferenceMediaUploadResponse = { id: string; url: string; mimeType: string; bytes: number };

const IMAGE_SIZE_STEP = 16;
const IMAGE_MAX_RATIO = 3;
const IMAGE_TASK_POLL_MS = 2000;
const UPSTREAM_IMAGE_TASK_POLL_MS = 5000;
const IMAGE_TASK_TIMEOUT_MS = 20 * 60 * 1000;
const FPBROWSER_VIDEO_IMAGE_MODELS = new Set(["nana-banana-2", "nana-banana-pro", "nana-banana-2-4k", "nana-banana-pro-4k", "gpt-image2-1k", "gpt-image2-2k", "gpt-image2-4k"]);
const EXTENDED_IMAGE_LIMITS: ImageResolutionLimits = { maxEdge: 4096, minPixels: 262144, maxPixels: 16777216 };
const OPENAI_IMAGE_LIMITS: ImageResolutionLimits = { maxEdge: 3840, minPixels: 655360, maxPixels: 8294400 };

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number, limits: ImageResolutionLimits) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error("图像尺寸的宽高必须是 16 的倍数，请调整尺寸");
    if (Math.max(width, height) > limits.maxEdge) throw new Error(`图像尺寸最长边不能超过 ${limits.maxEdge}px，请调整尺寸`);
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < limits.minPixels || pixels > limits.maxPixels) throw new Error(`图像总像素需在 ${limits.minPixels} 到 ${limits.maxPixels} 之间，请调整尺寸`);
}

export function resolveImageRequestSize(config: Pick<AiConfig, "channelMode" | "baseUrl"> & Partial<Pick<AiConfig, "model">>, quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const capabilities = config.model ? getImageModelCapabilities(config.model) : null;
    if (capabilities && !capabilities.supportsExplicitDimensions && parseImageDimensions(value)) return undefined;
    if (capabilities?.usesRatioSize && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value)) return value;
    const limits = isOfficialOpenAIImageEndpoint(config) ? OPENAI_IMAGE_LIMITS : EXTENDED_IMAGE_LIMITS;
    const dimensions = resolveSemanticImageDimensions(quality, value, limits);
    if (!dimensions) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    validateImageSize(dimensions.width, dimensions.height, limits);
    return `${dimensions.width}x${dimensions.height}`;
}

function isOfficialOpenAIImageEndpoint(config: Pick<AiConfig, "channelMode" | "baseUrl">) {
    if (config.channelMode !== "local") return false;
    try {
        return new URL(config.baseUrl).hostname.toLowerCase() === "api.openai.com";
    } catch {
        return false;
    }
}

function resolveImageDataUrl(item: Record<string, unknown>, outputFormat: string) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/${outputFormat === "jpg" ? "jpeg" : outputFormat};base64,${item.b64_json}`;
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

export function parseImagePayload(payload: ImageApiResponse, outputFormat = "png") {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const openAIImages =
        payload.data
            ?.map((item) => resolveImageDataUrl(item, outputFormat))
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];
    const geminiImages = payload.candidates ? parseGeminiImagePayload(payload as never).map((dataUrl) => ({ id: nanoid(), dataUrl })) : [];
    const images = [...openAIImages, ...geminiImages];

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

export async function requestGeneration(config: AiConfig, prompt: string, onProgress?: GenerationProgressCallback, onTaskRecovery?: ImageTaskRecoveryCallback) {
    config = resolveCustomChannelConfig(config, "image", (config.model || config.imageModel).trim());
    const requestedCount = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    if (config.channelMode === "local" && config.protocol === "gemini") return requestGeminiImage(config, prompt, [], requestedCount, onProgress);
    const capabilities = getImageModelCapabilities(config.model);
    const quality = normalizeImageQualityForModel(config.model, config.quality);
    const requestSize = resolveImageRequestSize(config, quality, config.size);
    if (shouldUseFpbrowserVideoImageApi(config)) {
        return requestFpbrowserVideoImageGeneration(config, prompt, [], { n: requestedCount, quality, size: requestSize }, onProgress);
    }
    const outputFormat = capabilities.supportsGif && config.imageOutputFormat === "gif" ? "gif" : "png";
    const background = capabilities.supportsBackground && outputFormat !== "gif" && ["opaque", "transparent"].includes(config.imageBackground) ? config.imageBackground : undefined;
    const payload = {
        model: config.model,
        prompt: withSystemPrompt(config, prompt),
        n: 1,
        async: true,
        ...(quality ? { quality } : {}),
        ...(requestSize ? { size: requestSize } : {}),
        ...(background ? { background } : {}),
        response_format: outputFormat === "gif" ? "url" : "b64_json",
        ...(capabilities.supportsOutputFormat ? { output_format: outputFormat } : {}),
    };
    try {
        const payloads = await Promise.all(
            Array.from({ length: requestedCount }, async () =>
                config.channelMode === "remote"
                    ? requestRemoteImageTask(config, "/images/generations", payload, aiHeaders(config, "application/json"), onProgress, onTaskRecovery)
                    : requestUpstreamImageTask(config, "/images/generations", payload, aiHeaders(config, "application/json"), onProgress, onTaskRecovery),
            ),
        );
        const images = payloads.flatMap((payloadData) => parseImagePayload(payloadData, outputFormat));
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, onProgress?: GenerationProgressCallback, onTaskRecovery?: ImageTaskRecoveryCallback) {
    config = resolveCustomChannelConfig(config, "image", (config.model || config.imageModel).trim());
    const requestedCount = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const capabilities = getImageModelCapabilities(config.model);
    if (references.length > capabilities.referenceLimit) throw new Error(`${config.model} 最多支持 ${capabilities.referenceLimit} 张参考图`);
    if (config.channelMode === "local" && config.protocol === "gemini") {
        if (mask) throw new Error("Gemini 原生图片协议暂不支持蒙版编辑");
        return requestGeminiImage(config, requestPrompt, references, requestedCount, onProgress);
    }
    const outputFormat = capabilities.supportsGif && config.imageOutputFormat === "gif" ? "gif" : "png";
    if (mask && outputFormat === "gif") throw new Error("GIF 输出不支持蒙版编辑，请改用 PNG");
    if (mask && !capabilities.supportsMask) throw new Error(`${config.model} 尚未在画布验证蒙版编辑`);
    const quality = normalizeImageQualityForModel(config.model, config.quality);
    const requestSize = resolveImageRequestSize(config, quality, config.size);
    if (shouldUseFpbrowserVideoImageApi(config)) {
        if (mask) throw new Error("当前 fpbrowser2api 图片模型暂不支持蒙版编辑");
        return requestFpbrowserVideoImageGeneration(config, requestPrompt, references, { n: requestedCount, quality, size: requestSize }, onProgress);
    }
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withSystemPrompt(config, requestPrompt));
    formData.set("n", "1");
    formData.set("async", "true");
    formData.set("response_format", outputFormat === "gif" ? "url" : "b64_json");
    if (capabilities.supportsOutputFormat) formData.set("output_format", outputFormat);
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set("size", requestSize);
    }
    if (capabilities.supportsBackground && outputFormat !== "gif" && ["opaque", "transparent"].includes(config.imageBackground)) {
        formData.set("background", config.imageBackground);
    }
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", dataUrlToFile(mask));

    try {
        const payloads = await Promise.all(
            Array.from({ length: requestedCount }, async () =>
                config.channelMode === "remote"
                    ? requestRemoteImageTask(config, "/images/edits", formData, aiHeaders(config), onProgress, onTaskRecovery)
                    : requestUpstreamImageTask(config, "/images/edits", formData, aiHeaders(config), onProgress, onTaskRecovery),
            ),
        );
        const images = payloads.flatMap((payloadData) => parseImagePayload(payloadData, outputFormat));
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function recoverImageGeneration(config: AiConfig, recovery: ImageTaskRecovery, onProgress?: GenerationProgressCallback) {
    config = resolveCustomChannelConfig(config, "image", (config.model || config.imageModel).trim());
    const outputFormat = getImageModelCapabilities(config.model).supportsGif && config.imageOutputFormat === "gif" ? "gif" : "png";
    try {
        if (!recovery.protocol && recovery.resultUrl) return [{ id: nanoid(), dataUrl: recovery.resultUrl }];
        const payload = recovery.protocol === "upstream" && recovery.path ? await waitUpstreamImageTask(config, recovery.path, recovery.taskId, onProgress) : await waitRemoteImageTask(config, recovery.taskId, onProgress);
        return parseImagePayload(payload, outputFormat);
    } catch (error) {
        throw new Error(readAxiosError(error, "图片制品读取失败"));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void) {
    config = resolveCustomChannelConfig(config, "text", (config.model || config.textModel).trim());
    assertChannelSupportsCapability(config, "text");
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
        if (config.protocol === "gemini") {
            const response = await axios.get(buildGeminiModelsUrl(config.baseUrl), {
                headers: { "x-goog-api-key": config.apiKey, Authorization: `Bearer ${config.apiKey}` },
            });
            return parseGeminiModels(response.data);
        }
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

async function requestGeminiImage(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, onProgress?: GenerationProgressCallback) {
    const imageParts = await Promise.all(references.map(async (image) => readGeminiDataUrl(await imageToDataUrl(image))));
    const payload = buildGeminiImagePayload({ prompt: withSystemPrompt(config, prompt), quality: config.quality, size: config.size, references: imageParts });
    notifyGenerationProgress(onProgress, { progress: 0 });
    try {
        const responses = await Promise.all(
            Array.from({ length: count }, () =>
                axios.post(buildGeminiApiUrl(config.baseUrl, config.model), payload, {
                    headers: { "x-goog-api-key": config.apiKey, Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
                }),
            ),
        );
        const images = responses.flatMap((response) => parseGeminiImagePayload(response.data)).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        notifyGenerationProgress(onProgress, { progress: 100 });
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "Gemini 图片生成失败"));
    }
}

async function requestRemoteImageTask(
    config: AiConfig,
    path: "/images/generations" | "/images/edits",
    body: Record<string, unknown> | FormData,
    headers: ReturnType<typeof aiHeaders>,
    onProgress?: GenerationProgressCallback,
    onTaskRecovery?: ImageTaskRecoveryCallback,
) {
    const created = unwrapEnvelope((await axios.post<ApiEnvelope<ImageTaskResponse>>(`/api/v1${path}/tasks`, body, { headers })).data, "生成任务创建失败");
    notifyGenerationProgress(onProgress, created);
    onTaskRecovery?.({ taskId: created.id, protocol: "canvas", status: "submitted" });
    return waitRemoteImageTask(config, created.id, onProgress, onTaskRecovery, created);
}

async function waitRemoteImageTask(config: AiConfig, taskId: string, onProgress?: GenerationProgressCallback, onTaskRecovery?: ImageTaskRecoveryCallback, initialTask?: ImageTaskResponse) {
    const startedAt = Date.now();
    let task = initialTask || unwrapEnvelope((await axios.get<ApiEnvelope<ImageTaskResponse>>(`/api/v1/images/tasks/${encodeURIComponent(taskId)}`, { headers: aiHeaders(config) })).data, "生成任务不存在");

    while (Date.now() - startedAt < IMAGE_TASK_TIMEOUT_MS) {
        if (task.status === "success") {
            if (!task.response) throw new Error("生成任务没有返回图片");
            onTaskRecovery?.({ taskId, protocol: "canvas", status: "completed", resultUrl: firstImageUrl(task.response) });
            return proxyTaskImageUrls(task.response, taskId);
        }
        if (task.status === "failed") {
            onTaskRecovery?.({ taskId, protocol: "canvas", status: "failed" });
            refreshRemoteUser(config);
            throw new Error(task.msg || "生成失败");
        }
        await delay(IMAGE_TASK_POLL_MS);
        task = unwrapEnvelope((await axios.get<ApiEnvelope<ImageTaskResponse>>(`/api/v1/images/tasks/${encodeURIComponent(taskId)}`, { headers: aiHeaders(config) })).data, "生成任务不存在");
        notifyGenerationProgress(onProgress, task);
    }

    throw new Error("生成任务仍在进行，请稍后重试或减少生成张数");
}

function proxyTaskImageUrls(response: ImageApiResponse, taskId: string): ImageApiResponse {
    if (!response.data?.length) return response;
    return {
        ...response,
        data: response.data.map((item, index) => (typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? { ...item, url: `/api/v1/images/tasks/${encodeURIComponent(taskId)}/content/${index}` } : item)),
    };
}

async function requestUpstreamImageTask(
    config: AiConfig,
    path: "/images/generations" | "/images/edits",
    body: Record<string, unknown> | FormData,
    headers: ReturnType<typeof aiHeaders>,
    onProgress?: GenerationProgressCallback,
    onTaskRecovery?: ImageTaskRecoveryCallback,
) {
    const created = (await axios.post<ImageApiResponse>(aiApiUrl(config, path), body, { headers })).data;
    if (created.data?.length || created.candidates?.length) {
        const resultUrl = firstImageUrl(created);
        if (resultUrl) onTaskRecovery?.({ taskId: created.id || `result-${nanoid()}`, status: "completed", resultUrl });
        return created;
    }
    if (!created.id || !created.status) return created;
    notifyGenerationProgress(onProgress, { progress: created.progress || 0 });
    onTaskRecovery?.({ taskId: created.id, protocol: "upstream", path, status: "submitted" });
    const createdStatus = created.status.toLowerCase();
    if (["completed", "success", "succeeded"].includes(createdStatus)) {
        onTaskRecovery?.({ taskId: created.id, protocol: "upstream", path, status: "completed", resultUrl: firstImageUrl(created) });
        return created;
    }
    if (["failed", "failure", "error", "cancelled", "canceled"].includes(createdStatus)) {
        onTaskRecovery?.({ taskId: created.id, protocol: "upstream", path, status: "failed" });
        throw new Error(created.error?.message || created.msg || "图片生成失败");
    }
    return waitUpstreamImageTask(config, path, created.id, onProgress, onTaskRecovery);
}

async function waitUpstreamImageTask(config: AiConfig, path: "/images/generations" | "/images/edits", taskId: string, onProgress?: GenerationProgressCallback, onTaskRecovery?: ImageTaskRecoveryCallback) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < IMAGE_TASK_TIMEOUT_MS) {
        await delay(UPSTREAM_IMAGE_TASK_POLL_MS);
        const task = (await axios.get<ImageApiResponse>(aiApiUrl(config, `${path}/${encodeURIComponent(taskId)}`), { headers: aiHeaders(config) })).data;
        notifyGenerationProgress(onProgress, { progress: task.progress || 0 });
        const taskStatus = String(task.status || "").toLowerCase();
        if (["completed", "success", "succeeded"].includes(taskStatus)) {
            onTaskRecovery?.({ taskId, protocol: "upstream", path, status: "completed", resultUrl: firstImageUrl(task) });
            return task;
        }
        if (["failed", "failure", "error", "cancelled", "canceled"].includes(taskStatus)) {
            onTaskRecovery?.({ taskId, protocol: "upstream", path, status: "failed" });
            throw new Error(task.error?.message || task.msg || "图片生成失败");
        }
    }
    throw new Error("图片任务仍在生成，请稍后到任务日志查看，不要重复提交");
}

function firstImageUrl(payload: ImageApiResponse) {
    const value = payload.data?.find((item) => typeof item.url === "string" && item.url)?.url;
    return typeof value === "string" ? value : undefined;
}

function isFpbrowserVideoImageModel(model: string) {
    return FPBROWSER_VIDEO_IMAGE_MODELS.has(model.trim().toLowerCase());
}

export function shouldUseFpbrowserVideoImageApi(config: Pick<AiConfig, "channelMode" | "protocol" | "model">) {
    return (config.channelMode === "local" && config.protocol === "fpbrowser2api") || isFpbrowserVideoImageModel(config.model);
}

async function requestFpbrowserVideoImageGeneration(config: AiConfig, prompt: string, references: ReferenceImage[], options: { n: number; quality?: string; size?: string }, onProgress?: GenerationProgressCallback) {
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
        notifyGenerationProgress(onProgress, created);
        if (!created.id) throw new Error("图片任务没有返回任务 ID");
        const createdUrls = readFpbrowserVideoImageUrls(created);
        if (createdUrls.length) {
            refreshRemoteUser(config);
            return createdUrls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < IMAGE_TASK_TIMEOUT_MS) {
            await delay(IMAGE_TASK_POLL_MS);
            const task = unwrapEnvelope(
                (await axios.get<ApiEnvelope<FpbrowserVideoImageResponse>>(aiApiUrl(config, `/videos/${created.id}`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model: config.model } : undefined })).data,
                "图片任务不存在",
            );
            notifyGenerationProgress(onProgress, task);
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
