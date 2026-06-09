import { describe, expect, test } from "bun:test";

import { canvasResourceMentionToken, canonicalizeCanvasResourceMentionText, renderCanvasResourceMentionText } from "./canvas-resource-mention-format";
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
    });

    test("canonicalizes visible resource labels back to stable node tokens", () => {
        expect(canonicalizeCanvasResourceMentionText("把 图片1 的车换进 视频1", references)).toBe("把 @[node:image-1] 的车换进 @[node:video-1]");
    });
});
