// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { buildVeoOmniFlashEditPayload, readVideoResultUrl } from "./video";

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
            duration: 8,
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
            duration: 8,
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
