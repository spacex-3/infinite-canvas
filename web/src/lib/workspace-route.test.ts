import { describe, expect, test } from "bun:test";

import { buildPromptHref } from "./workspace-route";

describe("buildPromptHref", () => {
    test("adds trimmed prompt to target route", () => {
        expect(buildPromptHref("/image", "  生成一张口红主图  ")).toBe("/image?prompt=%E7%94%9F%E6%88%90%E4%B8%80%E5%BC%A0%E5%8F%A3%E7%BA%A2%E4%B8%BB%E5%9B%BE");
    });

    test("keeps route clean when prompt is empty", () => {
        expect(buildPromptHref("/video", "   ")).toBe("/video");
    });
});
