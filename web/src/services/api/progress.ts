export type GenerationProgressCallback = (progress: number) => void;

export function normalizeGenerationProgress(value: unknown) {
    const raw = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
    if (!Number.isFinite(raw)) return undefined;
    const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(percent)));
}

export function notifyGenerationProgress(onProgress: GenerationProgressCallback | undefined, value: unknown) {
    const progress = normalizeGenerationProgress(value);
    if (progress === undefined) return;
    onProgress?.(progress);
}
