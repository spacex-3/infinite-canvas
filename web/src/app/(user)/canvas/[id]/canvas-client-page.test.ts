import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "canvas-client-page.tsx"), "utf8");

describe("CanvasClientPage image batches", () => {
    test("uses the root image node as one generated slot", () => {
        expect(source).toContain("const childIds = count > 1 ? Array.from({ length: count - 1 }, () => nanoid()) : [];");
        expect(source).toContain("const targetIds = [rootId, ...childIds];");
    });

    test("shows the selected image count as the batch total", () => {
        expect(source).toContain("const batchCount = getImageBatchDisplayCount(node);");
        expect(source).toContain("return Math.max(node.metadata.count || 0, childCount + 1);");
    });

    test("stores each batch result with a null-safe helper and limited concurrency", () => {
        expect(source).toContain("IMAGE_BATCH_CONCURRENCY");
        expect(source).toContain("mapWithConcurrency(targetIds, IMAGE_BATCH_CONCURRENCY");
        expect(source).toContain("storeGeneratedImage(image)");
        expect(source).toContain("await storeGeneratedImage(image)");
    });
});

describe("CanvasClientPage connected text generation", () => {
    test("opens the prompt panel when creating a connected text generation node", () => {
        expect(source).toContain("if (type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);");
    });
});

describe("CanvasClientPage retry config", () => {
    test("ignores stale node models that do not match the retry generation mode", () => {
        expect(source).toContain("isModelAvailableForCapability(config, savedModel, mode)");
        expect(source).toContain("generationModelForMode(config, node, mode)");
    });

    test("recovers an existing Seedance task without submitting another paid generation", () => {
        expect(source).toContain("const videoTaskRecovery = readVideoTaskRecovery(node)");
        expect(source).toContain("? await recoverVideoGeneration(generationConfig, videoTaskRecovery, updateRetryProgress)");
        expect(source).toContain("videoTaskId: recovery.taskId");
        expect(source).toContain('recovery.status === "completed" ? "页面刷新中断了视频取回，请重新下载。" : "页面刷新中断了任务查询，请继续查询。"');
    });

    test("recovers a completed image task without submitting another paid generation", () => {
        expect(source).toContain("const imageTaskRecovery = readImageTaskRecovery(node)");
        expect(source).toContain("? await recoverImageGeneration(generationConfig, imageTaskRecovery, updateRetryProgress)");
        expect(source).toContain("imageTaskId: recovery.taskId");
        expect(source).toContain('imageRecovery.status === "completed" ? "页面刷新中断了图片取回，请重新下载。" : "页面刷新中断了任务查询，请继续查询。"');
    });
});

describe("CanvasClientPage generation progress", () => {
    test("passes progress callbacks to canvas image and video generation requests", () => {
        expect(source).toContain('const updateGenerationProgress = (targetId: string, progress: number, progressStage?: "generating" | "caching" | "downloading" | "saving")');
        expect(source).toContain("(progress, stage) => updateGenerationProgress(videoId, progress, stage)");
        expect(source).toContain("(progress) => updateGenerationProgress(targetId, progress)");
        expect(source).toContain('const updateRetryProgress = (progress: number, progressStage?: "generating" | "caching" | "downloading" | "saving")');
    });
});

describe("CanvasClientPage destructive actions", () => {
    test("requires confirmation before deleting one or more nodes", () => {
        expect(source).toContain("const [deleteConfirmIds, setDeleteConfirmIds]");
        expect(source).toContain("performDeleteNodes(new Set(deleteConfirmIds))");
        expect(source).toContain("节点及相关连线将从当前画布移除");
    });
});
