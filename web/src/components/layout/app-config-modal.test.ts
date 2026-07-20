import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const modalSource = readFileSync(join(import.meta.dir, "app-config-modal.tsx"), "utf8");
const initSource = readFileSync(join(import.meta.dir, "client-root-init.tsx"), "utf8");

describe("ordinary-user custom channel configuration", () => {
    test("uses locked zpika dual hosts and group keys without free-form channel CRUD", () => {
        expect(modalSource).toContain("ZPIKA_BASE_URL");
        expect(modalSource).toContain("ZPIKA_DIRECT_BASE_URL");
        expect(modalSource).toContain("拉取模型域名（固定）");
        expect(modalSource).toContain("图片/视频生成域名（固定）");
        expect(modalSource).toContain("每个分组通常对应中转站不同套餐 Key");
        expect(modalSource).toContain("applyPreferredModelsToChannel");
        expect(modalSource).toContain("mode=\"tags\"");
        expect(modalSource).toContain("拉取模型");
        expect(modalSource).toContain("setFetchedModels");
        expect(modalSource).not.toContain("新增渠道");
        expect(modalSource).not.toContain("删除渠道");
        expect(modalSource).not.toContain('label="Base URL"');
        expect(modalSource).not.toContain('label="协议"');
        expect(modalSource).not.toContain("imageQualities");
        expect(modalSource).toContain("imageChannelId");
        expect(modalSource).toContain("videoChannelId");
        expect(modalSource).toContain("protocolLabel");
        expect(modalSource).toContain("zpika-veo-omni-flash");
        expect(modalSource).toContain("zpika-omni-flash");
    });

    test("uses the public feature flag for direct mode and URL imports", () => {
        expect(modalSource).toContain("canUseCustomChannel(user?.role, modelChannel?.allowCustomChannel === true)");
        expect(modalSource).not.toContain("普通用户仅可使用系统后台渠道");
        expect(initSource).toContain("canUseCustomChannel(user?.role, allowCustomChannel)");
        expect(initSource).toContain('"customChannels"');
        expect(initSource).toContain("ZPIKA_GROUP_IDS.text");
        expect(initSource).toContain("忽略 URL 中的 Base URL");
        expect(initSource).not.toContain('updateConfig("baseUrl"');
        expect(initSource).not.toContain("只有管理员可以导入本地直连配置");
    });

    test("auto-selects preferred models after fetch and keeps default bindings", () => {
        expect(modalSource).toContain("preferredDefaultForChannel");
        expect(modalSource).toContain("applyDefaultBindingAfterFetch");
        expect(modalSource).toContain("baseUrl: ZPIKA_BASE_URL");
        expect(modalSource).toContain("推荐优先");
        expect(modalSource).toContain("encodeBinding");
        expect(modalSource).toContain("updateBinding");
    });
});
