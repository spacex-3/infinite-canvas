import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "canvas-node-hover-toolbar.tsx"), "utf8");

describe("CanvasNodeHoverToolbar", () => {
    test("allows editing failed image nodes that still have a prompt", () => {
        expect(source).toContain("isPromptEditableImage");
        expect(source).toContain("const canOpenDialog = isText || hasImage || isVideo || isPromptEditableImage");
    });

    test("only shows text to image action when the text node has usable text", () => {
        expect(source).toContain("const canGenerateTextImage = isText && Boolean((node.metadata?.content || node.metadata?.prompt)?.trim());");
        expect(source).toContain("...(canGenerateTextImage ? [{ id: \"generateImage\"");
    });
});
