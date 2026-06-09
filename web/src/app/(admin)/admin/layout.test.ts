import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "layout.tsx"), "utf8");

describe("AdminLayout auth guard", () => {
    test("waits for user hydration before redirecting to login", () => {
        expect(source).toContain("const [authChecked, setAuthChecked] = useState(false)");
        expect(source).toContain("void hydrateUser().finally");
        expect(source).toContain("if (!authChecked) return");
        expect(source).toContain("!authChecked || !isReady || !token");
    });

    test("keeps admin menu navigation on Next links", () => {
        expect(source).toContain('import Link from "next/link"');
        expect(source).toContain("<Link href={item.key}");
    });
});
