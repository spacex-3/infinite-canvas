import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import * as imageApi from "./image";
import { buildGeminiApiUrl, buildGeminiImagePayload, parseGeminiImagePayload, parseGeminiModels, readGeminiDataUrl } from "./gemini-image";

const source = readFileSync(resolve(import.meta.dir, "image.ts"), "utf8");
const geminiSource = readFileSync(resolve(import.meta.dir, "gemini-image.ts"), "utf8");

describe("fpbrowser2api image model routing", () => {
    test("routes banana and gpt-image2 image models through the fpbrowser2api videos API", () => {
        expect(source).toContain("function isFpbrowserVideoImageModel");
        expect(source).toContain('"nana-banana-2"');
        expect(source).toContain('"nana-banana-pro"');
        expect(source).toContain('"gpt-image2-1k"');
        expect(source).toContain('aiApiUrl(config, "/videos")');
        expect(source).toContain("aiApiUrl(config, `/videos/${created.id}`)");
    });

    test("uses an explicitly selected local fpbrowser2api protocol", () => {
        expect(imageApi.shouldUseFpbrowserVideoImageApi({ channelMode: "local", protocol: "fpbrowser2api", model: "custom-image" })).toBe(true);
        expect(imageApi.shouldUseFpbrowserVideoImageApi({ channelMode: "remote", protocol: "fpbrowser2api", model: "custom-image" })).toBe(false);
    });
});

describe("Gemini native image protocol", () => {
    test("builds the documented generateContent URL and payload", () => {
        expect(buildGeminiApiUrl("https://vip.zpika.com/v1", "gemini-3.1-flash-image-preview")).toBe("https://vip.zpika.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent");
        expect(buildGeminiImagePayload({ prompt: "把参考图融合成海报", quality: "high", size: "9:16", references: [{ mimeType: "image/png", data: "BASE64_REF" }] })).toEqual({
            contents: [{ role: "user", parts: [{ text: "把参考图融合成海报" }, { inlineData: { mimeType: "image/png", data: "BASE64_REF" } }] }],
            generationConfig: { imageConfig: { imageSize: "4K", aspectRatio: "9:16" } },
        });
    });

    test("infers Gemini image resolution from explicit pixel dimensions", () => {
        expect(buildGeminiImagePayload({ prompt: "正方形海报", quality: "auto", size: "2048x2048", references: [] }).generationConfig.imageConfig.imageSize).toBe("2K");
        expect(buildGeminiImagePayload({ prompt: "高分辨率海报", quality: "auto", size: "3840x2160", references: [] }).generationConfig.imageConfig.imageSize).toBe("4K");
    });

    test("reads inline base64 and URL image responses", () => {
        expect(parseGeminiImagePayload({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/webp", data: "IMAGE_DATA" } }, { fileData: { mimeType: "image/png", fileUri: "https://cdn.example.com/image.png" } }] } }] })).toEqual([
            "data:image/webp;base64,IMAGE_DATA",
            "https://cdn.example.com/image.png",
        ]);
    });

    test("normalizes native Gemini model list names", () => {
        expect(parseGeminiModels({ models: [{ name: "models/gemini-3.1-flash-image-preview" }, { name: "models/gemini-3-pro-image-preview" }, { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }] })).toEqual([
            "gemini-3-pro-image-preview",
            "gemini-3.1-flash-image-preview",
        ]);
    });

    test("parses multiline data URLs without an ES2018 dotAll regex", () => {
        expect(geminiSource).not.toContain("data:([^;,]+);base64,(.+)$/s");
        expect(readGeminiDataUrl("data:image/png;base64,LINE_1\nLINE_2")).toEqual({ mimeType: "image/png", data: "LINE_1\nLINE_2" });
    });

    test("routes local Gemini channels and parses cloud Gemini task responses", () => {
        expect(source).toContain('config.protocol === "gemini"');
        expect(source).toContain("requestGeminiImage");
        expect(typeof imageApi.parseImagePayload).toBe("function");
        expect(imageApi.parseImagePayload!({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "REMOTE_IMAGE" } }] } }] })).toMatchObject([{ dataUrl: "data:image/png;base64,REMOTE_IMAGE" }]);
    });
});
