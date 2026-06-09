import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "page.tsx"), "utf8");

describe("LoginPage redirects", () => {
    test("uses browser navigation after successful auth", () => {
        expect(source).toContain("navigateAfterAuth");
        expect(source).toContain("window.location.href");
        expect(source).toContain("window.location.assign");
        expect(source).not.toContain("router.replace");
    });

    test("delays the browser-mutated login form until client mount", () => {
        expect(source).toContain("const [isMounted, setIsMounted] = useState(false)");
        expect(source).toContain("setIsMounted(true)");
        expect(source).toContain("if (!isMounted)");
    });

    test("does not auto-clear a stale persisted token while the login form is active", () => {
        expect(source).not.toContain("const storedToken = useUserStore");
        expect(source).not.toContain("const clearSession = useUserStore");
        expect(source).not.toContain(".catch(() => {");
        expect(source).not.toContain("clearSession();");
    });
});
