import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const canvasSource = readFileSync(join(import.meta.dir, "../[id]/canvas-client-page.tsx"), "utf8");
const configPanelSource = readFileSync(join(import.meta.dir, "canvas-config-node-panel.tsx"), "utf8");
const promptPanelSource = readFileSync(join(import.meta.dir, "canvas-node-prompt-panel.tsx"), "utf8");
const typesSource = readFileSync(join(import.meta.dir, "../types.ts"), "utf8");

describe("canvas video config", () => {
    test("stores image and video aspect ratios independently on config nodes", () => {
        expect(typesSource).toContain("videoSize?: string;");
        expect(canvasSource).toContain("videoSize: effectiveConfig.videoSize");
        expect(canvasSource).toContain("node?.metadata?.videoSize");
        expect(configPanelSource).toContain("node.metadata?.videoSize");
        expect(promptPanelSource).toContain("node.metadata?.videoSize");
        expect(configPanelSource).toContain('if (key === "videoSize") return { videoSize: value };');
        expect(promptPanelSource).toContain('if (key === "videoSize") return { videoSize: value };');
    });

    test("resolves saved node models from configured capability lists", () => {
        expect(canvasSource).toContain("isModelAvailableForCapability(config, savedModel, mode)");
        expect(canvasSource).toContain('isModelAvailableForCapability(effectiveConfig, savedImageMetadata.model, "image")');
        expect(configPanelSource).toContain("isModelAvailableForCapability(globalConfig, savedModel, mode)");
        expect(promptPanelSource).toContain("isModelAvailableForCapability(globalConfig, savedModel, mode)");
    });
});
