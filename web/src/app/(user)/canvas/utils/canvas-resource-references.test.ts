import { describe, expect, test } from "bun:test";

import { buildNodeMentionReferences } from "./canvas-resource-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

describe("buildNodeMentionReferences", () => {
    test("includes connected videos in node mention candidates", () => {
        const targetNode: CanvasNodeData = {
            id: "target-video",
            type: CanvasNodeType.Video,
            title: "Empty video",
            position: { x: 0, y: 0 },
            width: 240,
            height: 160,
            metadata: {},
        };
        const imageNode: CanvasNodeData = {
            id: "image-1",
            type: CanvasNodeType.Image,
            title: "Car",
            position: { x: 0, y: 0 },
            width: 240,
            height: 160,
            metadata: { content: "data:image/png;base64,abc" },
        };
        const videoNode: CanvasNodeData = {
            id: "video-1",
            type: CanvasNodeType.Video,
            title: "Dust road",
            position: { x: 0, y: 0 },
            width: 240,
            height: 160,
            metadata: { content: "https://cdn.example.com/input.mp4" },
        };
        const nodes = [targetNode, imageNode, videoNode];
        const connections: CanvasConnection[] = [
            { id: "image-to-video", fromNodeId: "image-1", toNodeId: "target-video" },
            { id: "video-to-video", fromNodeId: "video-1", toNodeId: "target-video" },
        ];

        expect(buildNodeMentionReferences(targetNode, nodes, connections).map((reference) => [reference.kind, reference.label, reference.nodeId])).toEqual([
            ["image", "图片1", "image-1"],
            ["video", "视频1", "video-1"],
        ]);
    });
});
