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

    test("replaces node mentions from saved config prompts without composer content", () => {
        const configNode: CanvasNodeData = {
            id: "config-1",
            type: CanvasNodeType.Config,
            title: "Config",
            position: { x: 0, y: 0 },
            width: 240,
            height: 160,
            metadata: { prompt: "把 @[node:video-1] 的飞机改成 @[node:image-1] 玩具乌龟" },
        };
        const videoNode: CanvasNodeData = {
            id: "video-1",
            type: CanvasNodeType.Video,
            title: "Input video",
            position: { x: 0, y: 0 },
            width: 320,
            height: 180,
            metadata: { content: "https://cdn.example.com/input.mp4", mimeType: "video/mp4" },
        };
        const imageNode: CanvasNodeData = {
            id: "image-1",
            type: CanvasNodeType.Image,
            title: "Toy turtle",
            position: { x: 0, y: 0 },
            width: 180,
            height: 180,
            metadata: { content: "data:image/png;base64,abc", mimeType: "image/png" },
        };
        const nodes = [configNode, videoNode, imageNode];
        const connections: CanvasConnection[] = [
            { id: "video-to-config", fromNodeId: "video-1", toNodeId: "config-1" },
            { id: "image-to-config", fromNodeId: "image-1", toNodeId: "config-1" },
        ];

        const context = buildNodeGenerationContext("config-1", nodes, connections, configNode.metadata.prompt);

        expect(context.prompt).toBe("把 视频1 的飞机改成 图片1 玩具乌龟");
        expect(context.referenceVideos.map((video) => video.id)).toEqual(["video-1"]);
        expect(context.referenceImages.map((image) => image.id)).toEqual(["image-1"]);
    });

    test("keeps image frame roles while numbering all referenced materials by send order", () => {
        const configNode: CanvasNodeData = {
            id: "config-1",
            type: CanvasNodeType.Config,
            title: "Config",
            position: { x: 0, y: 0 },
            width: 240,
            height: 160,
            metadata: { composerContent: "从 @[node:image-2;role:first_frame] 过渡到 @[node:image-1;role:last_frame]，参考 @[node:video-2] 和 @[node:video-1] 的运动" },
        };
        const imageNode = (id: string): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 180, height: 180, metadata: { content: `data:image/png;base64,${id}` } });
        const videoNode = (id: string): CanvasNodeData => ({ id, type: CanvasNodeType.Video, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: `https://example.com/${id}.mp4` } });
        const nodes = [configNode, imageNode("image-1"), imageNode("image-2"), videoNode("video-1"), videoNode("video-2")];
        const connections = nodes.slice(1).map((node, index) => ({ id: `conn-${index}`, fromNodeId: node.id, toNodeId: configNode.id }));

        const context = buildNodeGenerationContext(configNode.id, nodes, connections, configNode.metadata.composerContent);

        expect(context.prompt).toBe("从 图片1 过渡到 图片2，参考 视频1 和 视频2 的运动");
        expect(context.referenceImages.map((image) => [image.id, image.seedanceRole])).toEqual([
            ["image-2", "first_frame"],
            ["image-1", "last_frame"],
        ]);
        expect(context.referenceVideos.map((video) => video.id)).toEqual(["video-2", "video-1"]);
    });

    test("preserves multiple roles for the same image in mention order", () => {
        const configNode: CanvasNodeData = { id: "config-1", type: CanvasNodeType.Config, title: "Config", position: { x: 0, y: 0 }, width: 240, height: 160, metadata: {} };
        const imageNode: CanvasNodeData = { id: "image-1", type: CanvasNodeType.Image, title: "Image", position: { x: 0, y: 0 }, width: 180, height: 180, metadata: { content: "data:image/png;base64,abc" } };
        const connections = [{ id: "conn-1", fromNodeId: imageNode.id, toNodeId: configNode.id }];

        const context = buildNodeGenerationContext(configNode.id, [configNode, imageNode], connections, "@[node:image-1;role:first_frame] @[node:image-1;role:last_frame]");
        expect(context.referenceImages.map((image) => [image.id, image.seedanceRole])).toEqual([
            ["image-1", "first_frame"],
            ["image-1", "last_frame"],
        ]);
    });

    test("rejects stale mention tokens instead of silently dropping them", () => {
        const configNode: CanvasNodeData = { id: "config-1", type: CanvasNodeType.Config, title: "Config", position: { x: 0, y: 0 }, width: 240, height: 160, metadata: {} };

        expect(() => buildNodeGenerationContext(configNode.id, [configNode], [], "使用 @[node:missing-image]")).toThrow("引用素材已删除、断开或内容丢失");
    });
});
