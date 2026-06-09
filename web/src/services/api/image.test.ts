import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "image.ts"), "utf8");

describe("fpbrowser2api image model routing", () => {
    test("routes banana and gpt-image2 image models through the fpbrowser2api videos API", () => {
        expect(source).toContain("function isFpbrowserVideoImageModel");
        expect(source).toContain('"nana-banana-2"');
        expect(source).toContain('"nana-banana-pro"');
        expect(source).toContain('"gpt-image2-1k"');
        expect(source).toContain('aiApiUrl(config, "/videos")');
        expect(source).toContain('aiApiUrl(config, `/videos/${created.id}`)');
    });
});
