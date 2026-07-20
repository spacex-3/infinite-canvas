import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "canvas-node-prompt-panel.tsx"), "utf8");

describe("CanvasNodePromptPanel", () => {
    test("keeps the submitted prompt visible while generation is running or failed", () => {
        expect(source).not.toMatch(/onGenerate\(node\.id,\s*mode,\s*text\);\s*setPrompt\(""\);/);
    });

    test("prefills existing generated image prompt when opening the edit panel", () => {
        expect(source).toContain("const [prompt, setPrompt] = useState(initialPromptValue(node, isEditingExistingContent));");
        expect(source).toContain("setPrompt(initialPromptValue(node, isEditingExistingContent));");
        expect(source).toContain("function initialPromptValue(node: CanvasNodeData, isEditingExistingContent: boolean)");
        expect(source).toContain('return node.metadata?.prompt || (isEditingExistingContent ? "" : "");');
    });

    test("allows the prompt panel to be resized both horizontally and vertically", () => {
        expect(source).toContain("DEFAULT_PANEL_WIDTH = 500");
        expect(source).toContain("MAX_PANEL_WIDTH = 960");
        expect(source).toContain("MAX_TEXTAREA_HEIGHT = 640");
        expect(source).toContain('aria-label="调整输入框大小"');
        expect(source).toContain("cursor-nwse-resize");
        expect(source).toContain("setPanelWidth");
        expect(source).toContain("setTextareaHeight");
        expect(source).toContain("resize-none");
    });
});
