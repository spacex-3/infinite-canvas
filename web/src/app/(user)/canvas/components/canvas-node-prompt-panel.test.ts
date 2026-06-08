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
});
