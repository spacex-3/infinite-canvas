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
});
