import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const canvasSource = readFileSync(join(import.meta.dir, "../[id]/canvas-client-page.tsx"), "utf8");
const configPanelSource = readFileSync(join(import.meta.dir, "canvas-config-node-panel.tsx"), "utf8");
const promptPanelSource = readFileSync(join(import.meta.dir, "canvas-node-prompt-panel.tsx"), "utf8");
const settingsPopoverSource = readFileSync(join(import.meta.dir, "canvas-video-settings-popover.tsx"), "utf8");
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

    test("normalizes unsupported Seedance resolutions while keeping the compact summary readable", () => {
        expect(configPanelSource).toContain("videoModelPatch(config, model)");
        expect(promptPanelSource).toContain("videoModelPatch(config, model)");
        expect(settingsPopoverSource).toContain("videoSizeLabel(config.videoSize)");
        expect(settingsPopoverSource).toContain("videoSecondsLabel(config.videoSeconds)");
        expect(settingsPopoverSource).not.toContain("videoResolutionLabel");
    });

    test("locks Seedance frame requests to the adaptive ratio in both canvas entry points", () => {
        expect(configPanelSource).toContain("forceAdaptiveRatio={isSeedanceVideoModel(config.model) && hasSeedanceFrameMention");
        expect(promptPanelSource).toContain("forceAdaptiveRatio={isSeedanceVideoModel(config.model) && hasSeedanceFrameMention(prompt)}");
        expect(settingsPopoverSource).toContain('videoSizeLabel(forceAdaptiveRatio ? "adaptive" : config.videoSize)');
        expect(settingsPopoverSource).toContain("forceAdaptiveRatio={forceAdaptiveRatio}");
    });
});
