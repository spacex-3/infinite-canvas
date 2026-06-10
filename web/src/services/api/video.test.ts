// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { buildVeoOmniFlashEditPayload, buildVeoOmniPayload, isVeoOmniVideoModel, readVideoResultUrl } from "./video";

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
    test("uses the edit model and source video ratio when a reference video is present", () => {
        const payload = buildVeoOmniPayload(
            { size: "1:1" },
            "veo-omni-flash",
            "把视频1里的恐龙改成图片1里的乌龟",
            ["https://example.com/turtle.png"],
            [{ url: "https://example.com/source.mov", width: 720, height: 1280 }],
        );

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
        const payload = buildVeoOmniPayload({ size: "auto" }, "veo-omni-flash", "生成视频", ["https://example.com/a.png", "https://example.com/b.png"], []);

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
    });
});
