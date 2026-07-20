import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const textareaSource = readFileSync(join(import.meta.dir, "canvas-resource-mention-textarea.tsx"), "utf8");
const composerSource = readFileSync(join(import.meta.dir, "canvas-config-composer.tsx"), "utf8");
const promptPanelSource = readFileSync(join(import.meta.dir, "canvas-node-prompt-panel.tsx"), "utf8");
const assistantSource = readFileSync(join(import.meta.dir, "canvas-assistant-panel.tsx"), "utf8");

describe("canvas prompt keyboard behavior", () => {
    test("submits only from buttons while ordinary Enter remains text input", () => {
        expect(textareaSource).not.toContain("onSubmit?: () => void");
        expect(promptPanelSource).not.toContain("onSubmit={submit}");
        expect(assistantSource).not.toContain('event.key !== "Enter"');
    });

    test("preserves arrow-key selection for an unchanged mention", () => {
        expect(textareaSource).toContain("shouldResetCanvasReferenceSelection(mention, nextMention)");
        expect(composerSource).toContain("shouldResetCanvasReferenceSelection(mention, nextMention)");
    });

    test("uses the native textarea as the only visible text layer", () => {
        expect(textareaSource).not.toContain("overlayRef");
        expect(textareaSource).not.toContain("MentionHighlightText");
        expect(textareaSource).not.toContain('rgba(0,0,0,0.01)');
    });

    test("prompt panel uses free resize handle and assistant keeps vertical resizing", () => {
        expect(promptPanelSource).toContain('aria-label="调整输入框大小"');
        expect(promptPanelSource).toContain("setPanelWidth");
        expect(promptPanelSource).toContain("setTextareaHeight");
        expect(promptPanelSource).toContain("MAX_PANEL_WIDTH");
        expect(assistantSource).toContain("resize-y");
        expect(assistantSource).not.toMatch(/className="thin-scrollbar[^"]*resize-none/);
    });
});
