import { describe, expect, test } from "bun:test";

import { matchesCanvasReferenceQuery, readCanvasReferenceMention } from "./canvas-resource-query";

describe("matchesCanvasReferenceQuery", () => {
    test("matches shortened Chinese resource labels", () => {
        expect(matchesCanvasReferenceQuery(["图片1", "模特脸"], "图1")).toBe(true);
        expect(matchesCanvasReferenceQuery(["视频1", "参考视频"], "视1")).toBe(true);
        expect(matchesCanvasReferenceQuery(["音频1", "参考音频"], "音1")).toBe(true);
    });
});

describe("readCanvasReferenceMention", () => {
    test("detects mentions after Chinese text without whitespace", () => {
        const value = "图片1 的小猫改为@图";
        expect(readCanvasReferenceMention(value, value.length)).toEqual({ start: 9, query: "图" });
    });
});
