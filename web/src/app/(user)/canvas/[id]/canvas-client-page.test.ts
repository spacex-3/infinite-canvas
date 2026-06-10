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
});

describe("CanvasClientPage connected text generation", () => {
    test("opens the prompt panel when creating a connected text generation node", () => {
        expect(source).toContain("if (type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);");
    });
});

describe("CanvasClientPage retry config", () => {
    test("ignores stale node models that do not match the retry generation mode", () => {
        expect(source).toContain("modelMatchesCapability(savedModel, mode)");
        expect(source).toContain("generationModelForMode(config, node, mode)");
    });
});

describe("CanvasClientPage generation progress", () => {
    test("passes progress callbacks to canvas image and video generation requests", () => {
        expect(source).toContain("const updateGenerationProgress = (targetId: string, progress: number)");
        expect(source).toContain("(progress) => updateGenerationProgress(videoId, progress)");
        expect(source).toContain("(progress) => updateGenerationProgress(targetId, progress)");
        expect(source).toContain("const updateRetryProgress = (progress: number)");
    });
});
