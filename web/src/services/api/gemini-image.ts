export type GeminiImageReference = { mimeType: string; data: string };

type GeminiImagePart = {
    inlineData?: { mimeType?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
};

type GeminiImageResponse = {
    candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>;
    error?: { message?: string };
};

export function buildGeminiApiUrl(baseUrl: string, model: string) {
    return `${geminiApiBase(baseUrl)}/models/${encodeURIComponent(model.trim())}:generateContent`;
}

export function buildGeminiModelsUrl(baseUrl: string) {
    return `${geminiApiBase(baseUrl)}/models`;
}

export function buildGeminiImagePayload(input: { prompt: string; quality: string; size: string; references: GeminiImageReference[] }) {
    const imageSize = geminiImageSize(input.quality, input.size);
    const aspectRatio = geminiAspectRatio(input.size);
    return {
        contents: [
            {
                role: "user",
                parts: [{ text: input.prompt }, ...input.references.map((reference) => ({ inlineData: reference }))],
            },
        ],
        generationConfig: {
            imageConfig: {
                imageSize,
                ...(aspectRatio ? { aspectRatio } : {}),
            },
        },
    };
}

export function parseGeminiImagePayload(payload: GeminiImageResponse) {
    const images = (payload.candidates || []).flatMap((candidate) =>
        (candidate.content?.parts || []).flatMap((part) => {
            if (part.inlineData?.data) return [`data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`];
            if (part.fileData?.fileUri) return [part.fileData.fileUri];
            return [];
        }),
    );
    if (!images.length) throw new Error(payload.error?.message || "Gemini 接口没有返回图片");
    return images;
}

export function parseGeminiModels(payload: { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }) {
    return Array.from(
        new Set(
            (payload.models || [])
                .filter((model) => !model.supportedGenerationMethods?.length || model.supportedGenerationMethods.includes("generateContent"))
                .map((model) =>
                    String(model.name || "")
                        .replace(/^models\//, "")
                        .trim(),
                )
                .filter(isGeminiImageModelName)
                .filter(Boolean),
        ),
    ).sort((a, b) => a.localeCompare(b));
}

function isGeminiImageModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("image") || value.includes("imagen") || value.includes("banana");
}

export function readGeminiDataUrl(dataUrl: string): GeminiImageReference {
    const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if (!match) throw new Error("Gemini 参考图必须是可读取的图片数据");
    return { mimeType: match[1], data: match[2] };
}

function geminiApiBase(baseUrl: string) {
    return (
        baseUrl
            .trim()
            .replace(/\/+$/, "")
            .replace(/\/(?:v1beta|v1)$/i, "") + "/v1beta"
    );
}

function geminiImageSize(quality: string, size: string) {
    const value = quality.trim().toLowerCase();
    if (value === "high" || value === "4k") return "4K";
    if (value === "medium" || value === "hd" || value === "2k") return "2K";
    const dimensions = size.trim().match(/^(\d+)\s*[xX*×]\s*(\d+)$/);
    if (dimensions) {
        const longestEdge = Math.max(Number(dimensions[1]), Number(dimensions[2]));
        if (longestEdge >= 3000) return "4K";
        if (longestEdge >= 1800) return "2K";
    }
    return "1K";
}

function geminiAspectRatio(size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return "";
    const dimensions = value.match(/^(\d+)\s*[xX*×]\s*(\d+)$/);
    if (!dimensions) return /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value) ? value : "";
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function gcd(a: number, b: number): number {
    return b ? gcd(b, a % b) : Math.abs(a) || 1;
}
