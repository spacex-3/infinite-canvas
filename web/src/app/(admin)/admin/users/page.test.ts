import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("AdminUsersPage registration review", () => {
    test("shows pending users and provides a direct approval action", () => {
        expect(source).toContain('{ label: "待审核", value: "pending" }');
        expect(source).toContain('item.status === "pending"');
        expect(source).toContain("通过审核");
        expect(source).toContain('status: "active"');
    });
});
