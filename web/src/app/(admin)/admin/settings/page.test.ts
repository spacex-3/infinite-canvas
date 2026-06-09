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
        expect(source).toContain('setEpayPaymentMethods(form, values as string[])');
    });

    test("does not use deprecated InputNumber addonAfter", () => {
        expect(source).not.toContain("addonAfter=");
    });
});
