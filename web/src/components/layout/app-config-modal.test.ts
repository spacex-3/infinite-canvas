import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const modalSource = readFileSync(join(import.meta.dir, "app-config-modal.tsx"), "utf8");
const initSource = readFileSync(join(import.meta.dir, "client-root-init.tsx"), "utf8");

describe("ordinary-user custom channel configuration", () => {
    test("shows the same core channel fields without image quality routing", () => {
        expect(modalSource).toContain('label="协议"');
        expect(modalSource).toContain("value={config.protocol}");
        expect(modalSource).toContain('{ label: "zpika-veo-omni-flash", value: "fpbrowser2api" }');
        expect(modalSource).toContain('{ label: "zpika-omni-flash", value: "zerofall" }');
        expect(modalSource).toContain('label="渠道模型"');
        expect(modalSource).toContain('mode="tags"');
        expect(modalSource).toContain("拉取模型");
        expect(modalSource).toContain("setFetchedModels");
        expect(modalSource).not.toContain('updateConfig("models", models);');
        expect(modalSource).toContain("const channelModelOptions");
        expect(modalSource).toContain("const selectedModelOptions");
        expect(modalSource).toContain("options={channelModelOptions}");
        expect(modalSource).toContain("options={selectedModelOptions}");
        expect(modalSource).toContain('if (effectiveMode === "local" && !config.models.length)');
        expect(modalSource).toContain("config[group.modelsKey].includes(config[group.modelKey])");
        expect(modalSource).not.toContain("imageQualities");
    });

    test("uses the public feature flag for direct mode and URL imports", () => {
        expect(modalSource).toContain("canUseCustomChannel(user?.role, modelChannel?.allowCustomChannel === true)");
        expect(modalSource).not.toContain("普通用户仅可使用系统后台渠道");
        expect(initSource).toContain("canUseCustomChannel(user?.role, allowCustomChannel)");
        expect(initSource).not.toContain("只有管理员可以导入本地直连配置");
    });
});
