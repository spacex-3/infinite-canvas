import { describe, expect, test } from "bun:test";

import { buildSeedancePromptText, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceDurationOptionsForModel, seedanceFrameRatio, seedanceFrameReferenceWarning, seedanceReferenceCountError, seedanceReferenceLimitsForModel, seedanceResolutionOptionsForModel } from "./seedance-video";

describe("Seedance video defaults", () => {
    test("uses landscape and 5 seconds when values are empty", () => {
        expect(normalizeSeedanceResolution("", "doubao-seedance-2.0")).toBe("1080p");
        expect(normalizeSeedanceResolution("", "doubao-seedance-2.0-fast")).toBe("720p");
        expect(normalizeSeedanceRatio("")).toBe("16:9");
        expect(normalizeSeedanceDuration("")).toBe(5);
    });

    test("uses the dated model capability matrix", () => {
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-0-260128").map((item) => item.value)).toEqual(["480p", "720p", "1080p", "4k"]);
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-0-fast-260128").map((item) => item.value)).toEqual(["480p", "720p"]);
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-0-mini-260615").map((item) => item.value)).toEqual(["480p", "720p"]);
        expect(seedanceResolutionOptionsForModel("doubao-seedance-2-5-260628").map((item) => item.value)).toEqual(["480p", "720p", "1080p"]);
        expect(normalizeSeedanceResolution("4K", "doubao-seedance-2-0-260128")).toBe("4k");
        expect(normalizeSeedanceResolution("1080p", "doubao-seedance-2-0-mini-260615")).toBe("720p");
    });

    test("allows 30 seconds only for Seedance 2.5", () => {
        expect(seedanceDurationOptionsForModel("doubao-seedance-2-5-260628")).toContain(30);
        expect(normalizeSeedanceDuration("30", "doubao-seedance-2-5-260628")).toBe(30);
        expect(normalizeSeedanceDuration("30", "doubao-seedance-2-0-260128")).toBe(15);
        expect(normalizeSeedanceDuration("-1", "doubao-seedance-2-0-260128")).toBe(4);
    });

    test("uses model-specific reference limits", () => {
        expect(seedanceReferenceLimitsForModel("doubao-seedance-2-0-mini-260615")).toEqual({ images: 9, videos: 3, audios: 3, total: 15 });
        expect(seedanceReferenceLimitsForModel("doubao-seedance-2-5-260628")).toEqual({ images: 30, videos: 10, audios: 10, total: 50 });
        expect(seedanceReferenceCountError("doubao-seedance-2-0-mini-260615", { images: 10, videos: 0, audios: 0 })).toContain("最多支持 9 张");
        expect(seedanceReferenceCountError("doubao-seedance-2-5-260628", { images: 30, videos: 10, audios: 11 })).toContain("最多支持 10 个参考音频");
    });

    test("keeps native-protocol first-frame ratios for 2.0 and adaptive for 2.5", () => {
        const frames = [
            { id: "first", name: "first.png", type: "image/png", dataUrl: "first", seedanceRole: "first_frame" as const, width: 1080, height: 1920 },
            { id: "last", name: "last.png", type: "image/png", dataUrl: "last", seedanceRole: "last_frame" as const, width: 1080, height: 1920 },
        ];
        expect(seedanceFrameRatio("doubao-seedance-2-0-mini-260615", frames, "16:9")).toBe("9:16");
        expect(seedanceFrameRatio("doubao-seedance-2-0-fast-260128", frames, "16:9")).toBe("9:16");
        expect(seedanceFrameRatio("doubao-seedance-2-0-260128", frames, "16:9")).toBe("9:16");
        expect(seedanceFrameRatio("doubao-seedance-2-5-260628", frames, "16:9")).toBe("adaptive");
        expect(seedanceFrameReferenceWarning(frames, "doubao-seedance-2-0-fast-260128")).toBe("");
    });

    test("describes unverified frame dimensions without treating them as submission errors", () => {
        const first = { id: "first", name: "first.png", type: "image/png", dataUrl: "first", seedanceRole: "first_frame" as const, width: 1080, height: 1920 };
        expect(seedanceFrameReferenceWarning([first, { ...first, id: "last", seedanceRole: "last_frame", width: 1280 }], "doubao-seedance-2-5-260628")).toContain("仍可提交");
        expect(seedanceFrameReferenceWarning([{ ...first, width: 1280 }], "doubao-seedance-2-0-fast-260128")).toContain("仍可提交");
        expect(seedanceFrameReferenceWarning([{ ...first, width: 1280 }], "doubao-seedance-2-5-260628")).toBe("");
    });

    test("keeps one visible number when the same image has multiple roles", () => {
        const image = { id: "frame", name: "frame.png", type: "image/png", dataUrl: "https://example.com/frame.png" };
        expect(buildSeedancePromptText("从图片1开始并以图片1结束", [{ ...image, seedanceRole: "first_frame" }, { ...image, seedanceRole: "last_frame" }], [], [])).toContain("参考素材编号：图片1。");
    });
});
