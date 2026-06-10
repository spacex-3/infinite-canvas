import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "canvas-node.tsx"), "utf8");

describe("CanvasNode text actions", () => {
    test("does not show image generation for empty text nodes", () => {
        expect(source).toContain("const canGenerateImage = Boolean((node.metadata?.content || node.metadata?.prompt)?.trim());");
        expect(source).toContain("{canGenerateImage ? (");
    });

    test("shows loading progress when generation reports a percentage", () => {
        expect(source).toContain("formatGenerationProgress(node.metadata?.progress)");
        expect(source).toContain('return `生成中 ${clamped}%`;');
    });
});
