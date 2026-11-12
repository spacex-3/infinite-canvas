import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "canvas-node-hover-toolbar.tsx"), "utf8");
const imageToolsSource = readFileSync(join(import.meta.dir, "canvas-image-toolbar-tools.tsx"), "utf8");

describe("CanvasNodeHoverToolbar", () => {
    test("allows editing failed image nodes that still have a prompt", () => {
        expect(source).toContain("isPromptEditableImage");
        expect(source).toContain("const canOpenDialog = isText || hasImage || isVideo || isPromptEditableImage");
    });

    test("only shows text to image action when the text node has usable text", () => {
        expect(source).toContain("const canGenerateTextImage = isText && Boolean((node.metadata?.content || node.metadata?.prompt)?.trim());");
        expect(source).toContain("...(canGenerateTextImage ? [{ id: \"generateImage\"");
    });

    test("labels submitted and completed video recovery separately", () => {
        expect(source).toContain("const canRecoverVideo = canRetry && isVideo && Boolean(node.metadata?.videoTaskId)");
        expect(source).toContain('node.metadata?.videoTaskStatus === "completed"');
        expect(source).toContain('canRedownloadVideo ? "重新下载" : "继续查询"');
    });

    test("labels completed image recovery as a redownload", () => {
        expect(source).toContain("const canRecoverImage = canRetry && isImage");
        expect(source).toContain('node.metadata?.imageTaskStatus === "completed"');
        expect(source).toContain('canRedownload ? "重新下载" : "继续查询"');
    });

    test("uses a compact image toolbar by default and wraps customized tools", () => {
        expect(imageToolsSource).toContain('canvas-image-quick-tools-v6');
        expect(imageToolsSource).toContain('["delete", "saveAsset", "download", "edit"]');
        expect(source).toContain("flex-wrap");
        expect(source).toContain('maxWidth: "min(720px, calc(100vw - 24px))"');
    });
});
