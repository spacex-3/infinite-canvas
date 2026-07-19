// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { buildOmniFlashPayload, buildVeoOmniFlashEditPayload, buildVeoOmniPayload, isVeoOmniVideoModel, readVideoResultUrl, requestVideoGeneration, resolveVideoRequestProtocol } from "./video";
import { defaultConfig } from "@/stores/use-config-store";

describe("custom channel video protocol routing", () => {
    test("rejects Gemini native image channels before sending a video request", async () => {
        await expect(requestVideoGeneration({ ...defaultConfig, channelMode: "local", protocol: "gemini", baseUrl: "https://gemini.example.com", apiKey: "key", model: "custom-video", videoModel: "custom-video" }, "生成视频")).rejects.toThrow(
            "Gemini 原生图片协议仅支持图片生成和参考图编辑",
        );
    });

    test("uses the selected local protocol for provider aliases", () => {
        expect(resolveVideoRequestProtocol({ channelMode: "local", protocol: "zerofall" }, "custom-video")).toBe("zerofall");
        expect(resolveVideoRequestProtocol({ channelMode: "local", protocol: "fpbrowser2api" }, "custom-video")).toBe("fpbrowser2api");
    });

    test("does not let a saved local protocol override cloud routing", () => {
        expect(resolveVideoRequestProtocol({ channelMode: "remote", protocol: "zerofall" }, "custom-video")).toBe("openai");
        expect(resolveVideoRequestProtocol({ channelMode: "remote", protocol: "fpbrowser2api" }, "omni-flash")).toBe("zerofall");
    });
});

describe("buildVeoOmniFlashEditPayload", () => {
    test("builds the fpbrowser2api Veo edit JSON payload", () => {
        const payload = buildVeoOmniFlashEditPayload({
            model: "veo-omni-flash-video-edit",
            prompt: "turn this clip into a rainy cyberpunk scene",
            duration: "12",
            aspectRatio: "9:16",
            videoUrl: "https://cdn.example.com/input.mp4",
            imageUrls: ["https://cdn.example.com/ref-a.png", "https://cdn.example.com/ref-b.png"],
        });

        expect(payload).toEqual({
            model: "veo-omni-flash-video-edit",
            prompt: "turn this clip into a rainy cyberpunk scene",
            duration: 10,
            aspect_ratio: "9:16",
            video_url: "https://cdn.example.com/input.mp4",
            Ingredients_images: ["https://cdn.example.com/ref-a.png", "https://cdn.example.com/ref-b.png"],
        });
    });

    test("omits reference images when none are provided", () => {
        const payload = buildVeoOmniFlashEditPayload({
            model: "veo-omni-flash-video-edit",
            prompt: "make it cinematic",
            duration: "8",
            aspectRatio: "16:9",
            videoUrl: "https://cdn.example.com/input.mp4",
            imageUrls: [],
        });

        expect(payload).toEqual({
            model: "veo-omni-flash-video-edit",
            prompt: "make it cinematic",
            duration: 10,
            aspect_ratio: "16:9",
            video_url: "https://cdn.example.com/input.mp4",
        });
    });
});

describe("readVideoResultUrl", () => {
    test("reads completed fpbrowser2api video URLs without requiring a content endpoint", () => {
        expect(readVideoResultUrl({ id: "task-1", status: "completed", video_url: "https://cdn.example.com/out.mp4" })).toBe("https://cdn.example.com/out.mp4");
        expect(readVideoResultUrl({ id: "task-2", status: "completed", url: "https://cdn.example.com/out-url.mp4" })).toBe("https://cdn.example.com/out-url.mp4");
        expect(readVideoResultUrl({ id: "task-3", status: "completed", metadata: { result_urls: ["https://cdn.example.com/out-meta.mp4"] } })).toBe("https://cdn.example.com/out-meta.mp4");
    });
});

describe("Veo Omni video payload", () => {
    test("uses the global vertical video default independently from image size", () => {
        const payload = buildVeoOmniPayload(defaultConfig, "veo-omni-flash", "生成视频", [], []);

        expect(payload.aspect_ratio).toBe("9:16");
        expect(payload.width).toBe(1080);
        expect(payload.height).toBe(1920);
        expect(defaultConfig.size).toBe("1:1");
    });

    test("uses videoSize instead of the image size", () => {
        const payload = buildVeoOmniPayload({ size: "1:1", videoSize: "16:9" }, "veo-omni-flash", "生成横屏视频", [], []);

        expect(payload.aspect_ratio).toBe("16:9");
        expect(payload.width).toBe(1920);
        expect(payload.height).toBe(1080);
    });

    test("uses the edit model and source video ratio when a reference video is present", () => {
        const payload = buildVeoOmniPayload({ videoSize: "1:1" }, "veo-omni-flash", "把视频1里的恐龙改成图片1里的乌龟", ["https://example.com/turtle.png"], [{ url: "https://example.com/source.mov", width: 720, height: 1280 }]);

        expect(payload).toMatchObject({
            model: "veo-omni-flash-video-edit",
            aspect_ratio: "9:16",
            duration: 10,
            video_url: "https://example.com/source.mov",
            Ingredients_images: ["https://example.com/turtle.png"],
            width: 720,
            height: 1280,
            video_width: 720,
            video_height: 1280,
        });
        expect(payload.prompt).toContain("视频1");
        expect(payload.prompt).toContain("图片1");
        expect(payload.prompt).toContain("把视频1里的恐龙改成图片1里的乌龟");
    });

    test("keeps image references in order and defaults to vertical ratio", () => {
        const payload = buildVeoOmniPayload({ videoSize: "auto" }, "veo-omni-flash", "生成视频", ["https://example.com/a.png", "https://example.com/b.png"], []);

        expect(payload.model).toBe("veo-omni-flash");
        expect(payload.aspect_ratio).toBe("9:16");
        expect(payload.width).toBe(1080);
        expect(payload.height).toBe(1920);
        expect(payload.duration).toBe(10);
        expect(payload.Ingredients_images).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
        expect(payload.prompt).toContain("图片1、图片2");
    });

    test("recognizes only Veo Omni Flash video models", () => {
        expect(isVeoOmniVideoModel("veo-omni-flash")).toBe(true);
        expect(isVeoOmniVideoModel("veo-omni-flash-video-edit")).toBe(true);
        expect(isVeoOmniVideoModel("seedance-2-0")).toBe(false);
        expect(isVeoOmniVideoModel("omni-flash")).toBe(false);
    });
});

describe("ZeroFall omni-flash payload", () => {
    test("maps 16:9 size and 720 quality for generate mode", () => {
        const payload = buildOmniFlashPayload({
            model: "omni-flash",
            prompt: "两个角色在战斗",
            size: "16:9",
            quality: "720",
            seconds: "6",
            imageUrls: ["https://example.com/a.png", "https://example.com/b.png"],
        });

        expect(payload).toEqual({
            model: "omni-flash",
            prompt: "两个角色在战斗",
            duration: 6,
            aspect_ratio: "landscape",
            resolution: "720p",
            images: ["https://example.com/a.png", "https://example.com/b.png"],
        });
    });

    test("maps portrait size and 1080p for generate mode without images", () => {
        const payload = buildOmniFlashPayload({
            model: "omni-flash",
            prompt: "纯文生视频",
            size: "720x1280",
            quality: "1080p",
            seconds: "10",
            imageUrls: [],
        });

        expect(payload).toEqual({
            model: "omni-flash",
            prompt: "纯文生视频",
            duration: 10,
            aspect_ratio: "portrait",
            resolution: "1080p",
        });
        expect(payload.images).toBeUndefined();
    });

    test("builds edit payload with video and optional images", () => {
        const payload = buildOmniFlashPayload({
            model: "omni-flash",
            prompt: "make it cinematic",
            size: "9:16",
            quality: "high",
            seconds: "4",
            imageUrls: ["https://example.com/style.png"],
            videoUrl: "https://example.com/source.mp4",
            videoWidth: 720,
            videoHeight: 1280,
        });

        expect(payload).toEqual({
            model: "omni-flash-vref",
            prompt: "make it cinematic",
            duration: 10,
            aspect_ratio: "portrait",
            resolution: "1080p",
            video: "https://example.com/source.mp4",
            images: ["https://example.com/style.png"],
        });
    });

    test("edit mode with no images still sends empty images array", () => {
        const payload = buildOmniFlashPayload({
            model: "omni-flash-vref",
            prompt: "cinematic lighting",
            size: "1280x720",
            quality: "720",
            seconds: "10",
            imageUrls: [],
            videoUrl: "https://example.com/source.mp4",
        });

        expect(payload.model).toBe("omni-flash-vref");
        expect(payload.video).toBe("https://example.com/source.mp4");
        expect(payload.images).toEqual([]);
        expect(payload.duration).toBe(10);
        expect(payload.aspect_ratio).toBe("landscape");
    });
});
