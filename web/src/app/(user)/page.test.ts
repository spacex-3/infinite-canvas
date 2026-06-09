import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "page.tsx"), "utf8");

describe("IndexPage hydration", () => {
    test("delays the browser-mutated prompt textarea until client mount", () => {
        expect(source).toContain("const [isMounted, setIsMounted] = useState(false)");
        expect(source).toContain("setIsMounted(true)");
        expect(source).toContain("renderPromptTextarea");
        expect(source).toContain("if (!isMounted)");
    });
});
