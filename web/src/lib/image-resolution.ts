export type ImageResolutionQuality = "auto" | "high" | "medium" | "low";
export type ImageResolutionLimits = { maxEdge: number; minPixels: number; maxPixels: number };

const RESOLUTION_EDGE: Record<ImageResolutionQuality, number> = {
    auto: 1024,
    high: 4096,
    medium: 2048,
    low: 1024,
};
const DIMENSION_STEP = 16;

const DEFAULT_LIMITS: ImageResolutionLimits = { maxEdge: 4096, minPixels: 0, maxPixels: 4096 * 4096 };

export function resolveSemanticImageDimensions(quality: string | undefined, size: string, limits: ImageResolutionLimits = DEFAULT_LIMITS) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return null;
    const dimensions = value.match(/^(\d+)\s*[xX*×]\s*(\d+)$/);
    if (dimensions) return fitImageDimensions(Number(dimensions[1]), Number(dimensions[2]), limits);
    const ratio = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!ratio) return null;
    const ratioWidth = Number(ratio[1]);
    const ratioHeight = Number(ratio[2]);
    if (!ratioWidth || !ratioHeight) return null;
    const edge = Math.min(RESOLUTION_EDGE[normalizeImageResolutionQuality(quality)], limits.maxEdge);
    return ratioWidth >= ratioHeight ? fitImageDimensions(edge, edge * (ratioHeight / ratioWidth), limits) : fitImageDimensions(edge * (ratioWidth / ratioHeight), edge, limits);
}

function normalizeImageResolutionQuality(quality: string | undefined): ImageResolutionQuality {
    const value = quality?.trim().toLowerCase();
    if (value === "high" || value === "4k") return "high";
    if (value === "medium" || value === "2k") return "medium";
    if (value === "low" || value === "1k") return "low";
    return "auto";
}

function fitImageDimensions(width: number, height: number, limits: ImageResolutionLimits) {
    let scale = Math.min(1, limits.maxEdge / Math.max(width, height), Math.sqrt(limits.maxPixels / (width * height)));
    if (width * height * scale * scale < limits.minPixels) scale = Math.sqrt(limits.minPixels / (width * height));
    let nextWidth = Math.min(limits.maxEdge, scale > 1 ? alignImageDimensionUp(width * scale) : alignImageDimension(width * scale));
    let nextHeight = Math.min(limits.maxEdge, scale > 1 ? alignImageDimensionUp(height * scale) : alignImageDimension(height * scale));
    if (nextWidth * nextHeight > limits.maxPixels) {
        const correction = Math.sqrt(limits.maxPixels / (nextWidth * nextHeight));
        nextWidth = alignImageDimensionDown(nextWidth * correction);
        nextHeight = alignImageDimensionDown(nextHeight * correction);
    }
    if (nextWidth * nextHeight < limits.minPixels) {
        const correction = Math.sqrt(limits.minPixels / (nextWidth * nextHeight));
        nextWidth = Math.min(limits.maxEdge, alignImageDimensionUp(nextWidth * correction));
        nextHeight = Math.min(limits.maxEdge, alignImageDimensionUp(nextHeight * correction));
    }
    return { width: nextWidth, height: nextHeight };
}

function alignImageDimension(value: number) {
    return Math.max(DIMENSION_STEP, Math.round(value / DIMENSION_STEP) * DIMENSION_STEP);
}

function alignImageDimensionDown(value: number) {
    return Math.max(DIMENSION_STEP, Math.floor(value / DIMENSION_STEP) * DIMENSION_STEP);
}

function alignImageDimensionUp(value: number) {
    return Math.max(DIMENSION_STEP, Math.ceil(value / DIMENSION_STEP) * DIMENSION_STEP);
}
