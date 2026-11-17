import { describe, expect, test } from "bun:test";

import { buildMiniMaxH3Payload, isMiniMaxH3VideoModel, miniMaxH3ReferenceWarnings, normalizeMiniMaxH3Duration, normalizeMiniMaxH3Ratio, normalizeMiniMaxH3Resolution } from "./minimax-h3-video";

describe("MiniMax H3 video", () => {
    test("matches only the public MiniMax-H3 model name", () => {
        expect(isMiniMaxH3VideoModel("MiniMax-H3")).toBe(true);
        expect(isMiniMaxH3VideoModel("minimax-h3")).toBe(true);
        expect(isMiniMaxH3VideoModel("mm5-minimax-h3")).toBe(false);
    });

    test("normalizes supported settings", () => {
        expect(normalizeMiniMaxH3Resolution("2k")).toBe("2K");
        expect(normalizeMiniMaxH3Resolution("480p")).toBe("768P");
        expect(normalizeMiniMaxH3Duration("20")).toBe(15);
        expect(normalizeMiniMaxH3Duration("2")).toBe(4);
        expect(normalizeMiniMaxH3Ratio("auto")).toBe("adaptive");
        expect(normalizeMiniMaxH3Ratio("3:4")).toBe("3:4");
    });

    test("maps ordinary references and frame roles to the H3 JSON contract", () => {
        expect(
            buildMiniMaxH3Payload({
                prompt: "从首帧过渡到尾帧，参考视频和音频的节奏",
                duration: "8",
                resolution: "2K",
                ratio: "21:9",
                images: [
                    { url: "https://example.com/ref.png", role: "reference_image" },
                    { url: "https://example.com/first.png", role: "first_frame" },
                    { url: "https://example.com/last.png", role: "last_frame" },
                ],
                videos: ["https://example.com/ref.mp4"],
                audios: ["https://example.com/ref.mp3"],
            }),
        ).toEqual({
            model: "MiniMax-H3",
            prompt: "从首帧过渡到尾帧，参考视频和音频的节奏",
            duration: 8,
            resolution: "2K",
            aspect_ratio: "21:9",
            reference_image_urls: ["https://example.com/ref.png"],
            reference_videos: ["https://example.com/ref.mp4"],
            reference_audios: ["https://example.com/ref.mp3"],
            first_image_url: "https://example.com/first.png",
            last_image_url: "https://example.com/last.png",
        });
    });

    test("warns without deleting unsupported combinations", () => {
        expect(miniMaxH3ReferenceWarnings([{ id: "last", name: "last.png", type: "image/png", dataUrl: "x", seedanceRole: "last_frame" }], [], [])).toContain("已设置尾帧但没有首帧");
        expect(miniMaxH3ReferenceWarnings([], [], [{ id: "audio", name: "audio.mp3", type: "audio/mpeg", url: "x" }])).toContain("音频参考没有同时提供图片或视频");
    });
});
