import { describe, expect, test } from "bun:test";

import { defaultConfig } from "@/stores/use-config-store";
import { requestAudioGeneration } from "./audio";

describe("custom channel audio protocol routing", () => {
    test("rejects Gemini native image channels before sending an audio request", async () => {
        await expect(requestAudioGeneration({ ...defaultConfig, channelMode: "local", protocol: "gemini", baseUrl: "https://gemini.example.com", apiKey: "key", model: "custom-audio", audioModel: "custom-audio" }, "生成旁白")).rejects.toThrow(
            "Gemini 原生图片协议仅支持图片生成和参考图编辑",
        );
    });
});
