import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("AdminSettingsPage", () => {
    test("exposes registration email settings as a dedicated tab", () => {
        expect(source).toContain('{ key: "auth", label: "注册邮箱" }');
        expect(source).toContain('title="SMTP 邮箱"');
    });

    test("exposes epay payment methods as admin configurable options", () => {
        expect(source).toContain('label="支付渠道"');
        expect(source).toContain("paymentMethodOptions");
        expect(source).toContain("setEpayPaymentMethods(form, values as string[])");
    });

    test("does not use deprecated InputNumber addonAfter", () => {
        expect(source).not.toContain("addonAfter=");
    });

    test("exposes the ordinary-user custom channel switch and zpika protocol label", () => {
        expect(source).toContain('name={["public", "modelChannel", "allowCustomChannel"]}');
        expect(source).toContain('label="允许普通用户自定义渠道"');
        expect(source).toContain('{ label: "zpika-veo-omni-flash", value: "fpbrowser2api" }');
        expect(source).toContain('{ label: "zpika-omni-flash", value: "zerofall" }');
        expect(source.indexOf('label: "zpika-veo-omni-flash"')).toBeLessThan(source.indexOf('label: "zpika-omni-flash"'));
        expect(source).toContain('return "zpika-omni-flash";');
        expect(source).not.toContain('return "ZeroFall";');
    });

    test("keeps upstream channel models unselected until the administrator chooses them", () => {
        expect(source).toContain("setModelSelectSelected(current);");
        expect(source).not.toContain("setModelSelectSelected(uniqueModels([...current, ...channelModels]));");
    });

    test("offers the Gemini native image channel protocol", () => {
        expect(source).toContain('{ label: "Gemini 原生图片", value: "gemini" }');
    });
});
