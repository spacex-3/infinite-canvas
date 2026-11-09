import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "canvas-node.tsx"), "utf8");
const textContentSource = source.slice(source.indexOf("function TextContent"), source.indexOf("function ResourceLabelBadge"));

describe("CanvasNode text actions", () => {
    test("does not show image generation for empty text nodes", () => {
        expect(source).toContain("const canGenerateImage = Boolean((node.metadata?.content || node.metadata?.prompt)?.trim());");
        expect(source).toContain("{canGenerateImage ? (");
    });

    test("shows loading progress when generation reports a percentage", () => {
        expect(source).toContain("formatGenerationProgress(node.metadata?.progress, node.metadata?.progressStage)");
        expect(source).toContain('return `生成中 ${clamped}%`;');
        expect(source).toContain('return `服务器下载 ${Math.max(0, Math.min(100, Math.round(progress)))}%`;');
        expect(source).toContain('return `正在下载 ${Math.max(0, Math.min(100, Math.round(progress)))}%`;');
        expect(source).toContain('if (stage === "saving") return "正在保存视频";');
    });

    test("distinguishes task polling from completed video download recovery", () => {
        expect(source).toContain("const canRecoverVideo = node.type === CanvasNodeType.Video && Boolean(node.metadata?.videoTaskId)");
        expect(source).toContain('node.metadata?.videoTaskStatus === "completed"');
        expect(source).toContain('canRedownloadVideo ? "重新下载" : "继续查询"');
    });

    test("only lets the native control bar start video playback", () => {
        expect(source).toContain('className="absolute inset-x-0 bottom-12 top-0 cursor-move rounded-t-[18px]"');
        expect(source).toContain("<video src={node.metadata.content} controls");
    });

    test("lets users select generated text without starting a node drag", () => {
        expect(textContentSource).toContain("cursor-text select-text");
        expect(textContentSource).toContain("onMouseDown={(event) => event.stopPropagation()}");
    });

    test("does not force a fixed width on the generation prompt panel shell", () => {
        expect(source).toContain('{showPanel && renderPanel ? <div className="absolute left-1/2 top-full z-[70] -translate-x-1/2 pt-4">{renderPanel(data)}</div> : null}');
        expect(source).not.toContain('w-[500px] -translate-x-1/2 pt-4">{renderPanel(data)}');
    });
});
