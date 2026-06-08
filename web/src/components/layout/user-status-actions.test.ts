import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "user-status-actions.tsx"), "utf8");

describe("UserStatusActions", () => {
    test("does not render global marketing shortcuts", () => {
        expect(source).not.toContain('aria-label="文档"');
        expect(source).not.toContain("DOCS_URL");
        expect(source).not.toContain("GitHubLink");
        expect(source).not.toContain("VersionReleaseModal");
    });
});
