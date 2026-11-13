import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { imageQualityLabel, imageSizeLabel } from "./image-settings-panel";
import { imageSettingsSummaryParts } from "@/lib/image-model-capabilities";

const source = readFileSync(join(import.meta.dir, "image-settings-panel.tsx"), "utf8");

describe("image settings panel", () => {
    test("shows semantic resolution choices separately from aspect ratios", () => {
        expect(imageQualityLabel("high")).toBe("4K");
        expect(imageQualityLabel("medium")).toBe("2K");
        expect(imageQualityLabel("low")).toBe("1K");
        expect(imageSizeLabel("1:1")).toBe("1:1");
        expect(source).toContain('capabilities.lockedResolution && capabilities.qualityOptions.length ? "质量" : "分辨率"');
        expect(source).toContain("Low / Medium / High 按 std 价，XHigh / Max 按 xhigh 价");
        expect(source).toContain("imageOutputFormat");
        expect(source).toContain("imageBackground");
        expect(source).not.toContain("1:1(2k)");
        expect(source).not.toContain("16:9(4k)");
        expect(source).not.toContain("9:16(4k)");
        expect(source).not.toContain("item.size");
    });

    test("summarizes tier, resolution, and quality without dropping K-tier resolution", () => {
        expect(imageSettingsSummaryParts("gpt-image-2.6", "high")).toEqual({ tier: "web", resolution: "最高约 1.5K", quality: "默认" });
        expect(imageSettingsSummaryParts("gpt-image-2.6-flare", "high")).toEqual({ tier: "超分", resolution: "自身尺寸", quality: "默认" });
        expect(imageSettingsSummaryParts("gpt-image-2.6-flare-2k", "xhigh")).toEqual({ tier: "", resolution: "2K", quality: "XHigh" });
    });
});
