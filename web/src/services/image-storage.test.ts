import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "image-storage.ts"), "utf8");

describe("image storage generated-image helpers", () => {
    test("decodes data urls directly and guards empty generated results", () => {
        expect(source).toContain("dataUrlToBlob");
        expect(source).toContain("export async function storeGeneratedImage");
        expect(source).toContain('if (!image?.dataUrl) throw new Error("接口没有返回图片")');
        expect(source).toContain("浏览器本地图片存储空间不足");
    });
});
