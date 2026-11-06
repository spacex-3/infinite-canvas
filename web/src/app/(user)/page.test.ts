import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "page.tsx"), "utf8");

describe("IndexPage", () => {
    test("centers the product on canvas and reusable ideas", () => {
        expect(source).toContain("AI 时代的个人想法实现工作台");
        expect(source).toContain('href="/canvas"');
        expect(source).toContain("进入画布");
        expect(source).toContain("可复用灵感");
        expect(source).not.toContain("今日工作流");
        expect(source).not.toContain("电商");
    });
});
