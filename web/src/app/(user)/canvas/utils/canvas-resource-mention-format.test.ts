import { describe, expect, test } from "bun:test";

import { canvasResourceMentionLabels, canvasResourceMentionToken, canonicalizeCanvasResourceMentionText, renderCanvasResourceMentionText, seedanceMentionResourceDisabledReason, seedanceMentionRoleDisabledReason } from "./canvas-resource-mention-format";
import type { CanvasResourceReference } from "./canvas-resource-references";

const references: CanvasResourceReference[] = [
    { id: "image-1", nodeId: "image-1", kind: "image", label: "图片1", title: "Car", active: true },
    { id: "video-1", nodeId: "video-1", kind: "video", label: "视频1", title: "Dust road", active: true },
];

describe("canvas resource mention formatting", () => {
    test("stores selected resources as stable node tokens", () => {
        expect(canvasResourceMentionToken(references[1])).toBe("@[node:video-1]");
    });

    test("renders node tokens with their current resource labels", () => {
        expect(renderCanvasResourceMentionText("把 @[node:image-1] 的车换进 @[node:video-1]", references)).toBe("把 图片1 的车换进 视频1");
        expect(renderCanvasResourceMentionText("从 @[node:image-1;role:first_frame] 开始", references)).toBe("从 图片1 · 首帧 开始");
    });

    test("canonicalizes visible resource labels back to stable node tokens", () => {
        expect(canonicalizeCanvasResourceMentionText("把 图片1 的车换进 视频1", references)).toBe("把 @[node:image-1] 的车换进 @[node:video-1]");
    });

    test("numbers only selected resources by first mention order", () => {
        const resources = [
            ...references,
            { id: "image-2", nodeId: "image-2", kind: "image" as const, label: "图片2", title: "Lake", active: true },
        ];
        const labels = canvasResourceMentionLabels("@[node:image-2] @[node:video-1] @[node:image-1]", resources);
        expect(Array.from(labels.entries())).toEqual([
            ["image-2", "图片1"],
            ["video-1", "视频1"],
            ["image-1", "图片2"],
        ]);
    });

    test("disables invalid frame combinations and model overflows", () => {
        const resources = [
            ...references.map((reference) => ({ nodeId: reference.nodeId, kind: reference.kind })),
            { nodeId: "image-2", kind: "image" as const },
            { nodeId: "video-2", kind: "video" as const },
            { nodeId: "video-3", kind: "video" as const },
            { nodeId: "video-4", kind: "video" as const },
        ];
        expect(seedanceMentionRoleDisabledReason("", resources, resources[2], "last_frame", "doubao-seedance-2-0-mini-260615")).toContain("请先设置首帧");
        expect(seedanceMentionResourceDisabledReason("@[node:image-1;role:first_frame]", resources, resources[1], "doubao-seedance-2-0-mini-260615")).toContain("首尾帧模式");
        expect(seedanceMentionResourceDisabledReason("@[node:video-1] @[node:video-2] @[node:video-3]", resources, resources[5], "doubao-seedance-2-0-mini-260615")).toContain("最多支持 3 个");
    });
});
