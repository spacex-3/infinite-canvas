import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "use-user-store.ts"), "utf8");

describe("useUserStore hydration", () => {
    test("recovers the persisted token snapshot before redirect guards run", () => {
        expect(source).toContain("function readAuthTokenSnapshot()");
        expect(source).toContain("readAuthTokenCookie() || get().token || readAuthTokenSnapshot()");
        expect(source).toContain("document.cookie");
        expect(source).toContain("readAuthTokenCookie()");
        expect(source).not.toContain("onRehydrateStorage: () => (state) =>");
    });
});
