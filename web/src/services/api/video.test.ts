import { describe, expect, test } from "bun:test";

import { buildVeoOmniPayload, isVeoOmniVideoModel } from "./video";

describe("Veo Omni video payload", () => {
    test("uses the edit model and source video ratio when a reference video is present", () => {
        const payload = buildVeoOmniPayload(
            { size: "1:1" } as any,
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
        const payload = buildVeoOmniPayload({ size: "auto" } as any, "veo-omni-flash", "生成视频", ["https://example.com/a.png", "https://example.com/b.png"], []);

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
