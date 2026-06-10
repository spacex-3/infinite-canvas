export type GenerationProgressCallback = (progress: number) => void;

export function normalizeGenerationProgress(value: unknown) {
    const raw = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
    if (!Number.isFinite(raw)) return undefined;
    const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(percent)));
}

export function readGenerationProgress(value: unknown) {
    const direct = normalizeGenerationProgress(value);
    if (direct !== undefined) return direct;
    if (!value || typeof value !== "object") return undefined;

    const record = value as Record<string, unknown>;
    for (const key of ["progress", "progress_pct", "progressPercent", "progress_percent", "percentage"]) {
        const progress = normalizeGenerationProgress(record[key]);
        if (progress !== undefined) return progress;
    }
    for (const key of ["data", "metadata", "result", "response", "content"]) {
        const progress = readGenerationProgress(record[key]);
        if (progress !== undefined) return progress;
    }
    return undefined;
}

export function notifyGenerationProgress(onProgress: GenerationProgressCallback | undefined, value: unknown) {
    const progress = readGenerationProgress(value);
    if (progress === undefined) return;
    onProgress?.(progress);
}
