// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { buildNodeGenerationContext } from "./canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

describe("buildNodeGenerationContext", () => {
    test("uses composer-selected video nodes as video references", () => {
        const configNode: CanvasNodeData = {
            id: "config-1",
            type: CanvasNodeType.Config,
            title: "Config",
            position: { x: 0, y: 0 },
            width: 240,
            height: 160,
            metadata: { composerContent: "把图片车替换进 @[node:video-1]" },
        };
        const videoNode: CanvasNodeData = {
            id: "video-1",
            type: CanvasNodeType.Video,
            title: "Desert driving",
            position: { x: 0, y: 0 },
            width: 320,
            height: 180,
            metadata: { content: "https://cdn.example.com/input.mp4", mimeType: "video/mp4", storageKey: "video-storage-key" },
        };
        const nodes = [configNode, videoNode];
        const connections: CanvasConnection[] = [{ id: "conn-1", fromNodeId: "video-1", toNodeId: "config-1" }];

        const context = buildNodeGenerationContext("config-1", nodes, connections, "把图片车替换进 @[node:video-1]");

        expect(context.prompt).toBe("把图片车替换进 视频1");
        expect(context.referenceVideos).toEqual([
            {
                id: "video-1",
                name: "Desert driving.mp4",
                type: "video/mp4",
                url: "https://cdn.example.com/input.mp4",
                storageKey: "video-storage-key",
                bytes: undefined,
                width: undefined,
                height: undefined,
                durationMs: undefined,
            },
        ]);
        expect(context.videoCount).toBe(1);
    });
});
