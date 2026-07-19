import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { imageQualityLabel, imageSizeLabel } from "./image-settings-panel";

const source = readFileSync(join(import.meta.dir, "image-settings-panel.tsx"), "utf8");

describe("image settings panel", () => {
    test("shows semantic resolution choices separately from aspect ratios", () => {
        expect(imageQualityLabel("high")).toBe("4K");
        expect(imageQualityLabel("medium")).toBe("2K");
        expect(imageQualityLabel("low")).toBe("1K");
        expect(imageSizeLabel("1:1")).toBe("1:1");
        expect(source).toContain("<SettingTitle color={theme.node.muted}>分辨率</SettingTitle>");
        expect(source).not.toContain("1:1(2k)");
        expect(source).not.toContain("16:9(4k)");
        expect(source).not.toContain("9:16(4k)");
        expect(source).not.toContain("item.size");
    });
});
