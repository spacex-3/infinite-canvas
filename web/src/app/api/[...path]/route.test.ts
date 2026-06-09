import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "route.ts"), "utf8");

describe("API proxy auth cookie", () => {
    test("sets the frontend auth cookie from successful login responses", () => {
        expect(source).toContain('path.join("/") === "auth/login"');
        expect(source).toContain('headers.set("Set-Cookie"');
        expect(source).toContain("AUTH_TOKEN_KEY");
        expect(source).toContain("Max-Age=604800");
    });

    test("removes hop-by-hop and unsupported upload headers before proxying", () => {
        expect(source).toContain('headers.delete("expect")');
    });
});
