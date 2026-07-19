"use client";

import { App, Button, Form, Input, Modal, Segmented, Select, Tooltip } from "antd";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { fetchImageModels } from "@/services/api/image";
import { canUseCustomChannel, useConfigStore, useEffectiveConfig, type AiConfig, type CustomAiChannel, type CustomChannelProtocol, type ModelCapability } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    modelsKey: "imageModels" | "videoModels" | "textModels" | "audioModels";
    channelKey: "imageChannelId" | "videoChannelId" | "textChannelId" | "audioChannelId";
    defaultLabel: string;
    optionsLabel: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", modelsKey: "imageModels", channelKey: "imageChannelId", defaultLabel: "默认生图渠道 / 模型", optionsLabel: "生图模型可选项" },
    { capability: "video", modelKey: "videoModel", modelsKey: "videoModels", channelKey: "videoChannelId", defaultLabel: "默认视频渠道 / 模型", optionsLabel: "视频模型可选项" },
    { capability: "text", modelKey: "textModel", modelsKey: "textModels", channelKey: "textChannelId", defaultLabel: "默认文本渠道 / 模型", optionsLabel: "文本模型可选项" },
    { capability: "audio", modelKey: "audioModel", modelsKey: "audioModels", channelKey: "audioChannelId", defaultLabel: "默认音频渠道 / 模型", optionsLabel: "音频模型可选项" },
];

export function AppConfigModal() {
    const { message } = App.useApp();
    const [selectedChannelId, setSelectedChannelId] = useState("");
    const [loadingChannelId, setLoadingChannelId] = useState("");
    const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const canUseLocalChannel = canUseCustomChannel(user?.role, modelChannel?.allowCustomChannel === true);
    const effectiveMode = canUseLocalChannel ? config.channelMode : "remote";
    const activeChannelId = config.customChannels.some((channel) => channel.id === selectedChannelId) ? selectedChannelId : config.customChannels[0]?.id || "";
    const selectedChannel = config.customChannels.find((channel) => channel.id === activeChannelId);
    const visibleModelGroups = selectedChannel?.protocol === "gemini" ? modelGroups.filter((group) => group.capability === "image") : modelGroups;
    const configuredChannels = config.customChannels.filter((channel) => channel.baseUrl.trim() && channel.apiKey.trim() && channel.models.length);
    const channelModelOptions = uniqueModels([...(selectedChannel?.models || []), ...(fetchedModels[activeChannelId] || [])]).map((model) => ({ label: model, value: model }));
    const selectedModelOptions = (selectedChannel?.models || []).map((model) => ({ label: model, value: model }));

    const finishConfig = () => {
        if (effectiveMode === "local" && !configuredChannels.length) {
            message.error("请至少完整配置一个自定义渠道和模型");
            return;
        }
        if (effectiveMode === "remote" && (!effectiveConfig.imageModel.trim() || !effectiveConfig.videoModel.trim() || !effectiveConfig.textModel.trim())) return;
        setConfigDialogOpen(false);
        message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
        clearPromptContinue();
    };

    const updateCustomChannel = (patch: Partial<CustomAiChannel>) => {
        if (!selectedChannel) return;
        updateConfig(
            "customChannels",
            config.customChannels.map((channel) => (channel.id === selectedChannel.id ? { ...channel, ...patch } : channel)),
        );
    };

    const updateChannelProtocol = (protocol: CustomChannelProtocol) => {
        if (!selectedChannel) return;
        updateCustomChannel(protocol === "gemini" ? { protocol, videoModels: [], textModels: [], audioModels: [] } : { protocol });
        if (protocol !== "gemini") return;
        for (const group of modelGroups.filter((item) => item.capability !== "image")) {
            if (config[group.channelKey] !== selectedChannel.id) continue;
            updateConfig(group.channelKey, "");
            updateConfig(group.modelKey, "");
        }
    };

    const refreshModels = async () => {
        if (!selectedChannel) return;
        if (!selectedChannel.baseUrl.trim() || !selectedChannel.apiKey.trim()) {
            message.error("请先填写 Base URL 和 API Key");
            return;
        }
        setLoadingChannelId(selectedChannel.id);
        try {
            const requestConfig = { ...effectiveConfig, channelMode: "local" as const, protocol: selectedChannel.protocol, baseUrl: selectedChannel.baseUrl, apiKey: selectedChannel.apiKey, model: selectedChannel.models[0] || "" };
            const models = uniqueModels(await fetchImageModels(requestConfig));
            setFetchedModels((current) => ({ ...current, [selectedChannel.id]: models }));
            message.success(`已获取 ${models.length} 个模型，请手动选择`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingChannelId("");
        }
    };

    const updateCapabilityModels = (group: ModelGroup, models: string[]) => {
        if (!selectedChannel) return;
        const next = uniqueModels(models);
        updateCustomChannel({ [group.modelsKey]: next });
        if (config[group.channelKey] === selectedChannel.id && !next.includes(config[group.modelKey])) updateConfig(group.modelKey, next[0] || "");
    };

    const updateChannelModels = (models: string[]) => {
        if (!selectedChannel) return;
        const next = uniqueModels(models);
        const patch: Partial<CustomAiChannel> = { models: next };
        for (const group of modelGroups) patch[group.modelsKey] = selectedChannel[group.modelsKey].filter((model) => next.includes(model));
        updateCustomChannel(patch);
        for (const group of modelGroups) {
            if (config[group.channelKey] === selectedChannel.id && !patch[group.modelsKey]?.includes(config[group.modelKey])) updateConfig(group.modelKey, patch[group.modelsKey]?.[0] || "");
        }
    };

    const addChannel = () => {
        const channel = createCustomChannel(config.customChannels.length + 1);
        updateConfig("customChannels", [...config.customChannels, channel]);
        setSelectedChannelId(channel.id);
    };

    const deleteChannel = () => {
        if (!selectedChannel || config.customChannels.length === 1) return;
        const channels = config.customChannels.filter((channel) => channel.id !== selectedChannel.id);
        updateConfig("customChannels", channels);
        setSelectedChannelId(channels[0]?.id || "");
        for (const group of modelGroups) {
            if (config[group.channelKey] !== selectedChannel.id) continue;
            const fallback = channels.find((channel) => channel[group.modelsKey].length);
            updateConfig(group.channelKey, fallback?.id || "");
            updateConfig(group.modelKey, fallback?.[group.modelsKey][0] || "");
        }
    };

    const bindingOptions = (group: ModelGroup) =>
        config.customChannels.flatMap((channel) =>
            channel[group.modelsKey].map((model) => ({
                label: `${channel.name} / ${model}`,
                value: encodeBinding(channel.id, model),
            })),
        );

    const updateBinding = (group: ModelGroup, value?: string) => {
        if (!value) {
            updateConfig(group.channelKey, "");
            updateConfig(group.modelKey, "");
            return;
        }
        const binding = decodeBinding(value);
        updateConfig(group.channelKey, binding.channelId);
        updateConfig(group.modelKey, binding.model);
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">配置与用户偏好</div>
                    <div className="mt-1 text-xs font-normal text-muted-foreground">模型、渠道和画布默认行为</div>
                </div>
            }
            open={isConfigOpen}
            width={960}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 18 } }}
            footer={
                <Button type="primary" onClick={finishConfig}>
                    完成
                </Button>
            }
        >
            <div className="pt-1">
                <Form layout="vertical" requiredMark={false}>
                    {canUseLocalChannel ? (
                        <Form.Item label="渠道模式" className="mb-5">
                            <Segmented
                                block
                                size="middle"
                                value={effectiveMode}
                                onChange={(value) => updateConfig("channelMode", value as AiConfig["channelMode"])}
                                options={[
                                    { label: "自定义渠道", value: "local" },
                                    { label: "云端渠道", value: "remote" },
                                ]}
                            />
                        </Form.Item>
                    ) : null}

                    {effectiveMode === "local" && selectedChannel ? (
                        <>
                            <div className="mb-4 flex items-center gap-2">
                                <Select className="min-w-0 flex-1" value={selectedChannel.id} options={config.customChannels.map((channel) => ({ label: channel.name, value: channel.id }))} onChange={setSelectedChannelId} />
                                <Button icon={<Plus className="size-4" />} onClick={addChannel}>
                                    新增渠道
                                </Button>
                                <Tooltip title="删除渠道">
                                    <Button aria-label="删除渠道" danger disabled={config.customChannels.length === 1} icon={<Trash2 className="size-4" />} onClick={deleteChannel} />
                                </Tooltip>
                            </div>

                            <div className="grid gap-x-4 md:grid-cols-2">
                                <Form.Item label="渠道名称" className="mb-4">
                                    <Input value={selectedChannel.name} onChange={(event) => updateCustomChannel({ name: event.target.value })} />
                                </Form.Item>
                                <Form.Item label="协议" className="mb-4">
                                    <Select
                                        value={selectedChannel.protocol}
                                        options={[
                                            { label: "OpenAI 兼容", value: "openai" },
                                            { label: "Gemini 原生图片", value: "gemini" },
                                            { label: "zpika-veo-omni-flash", value: "fpbrowser2api" },
                                            { label: "zpika-omni-flash", value: "zerofall" },
                                        ]}
                                        onChange={(value) => updateChannelProtocol(value as CustomChannelProtocol)}
                                    />
                                </Form.Item>
                                <Form.Item label="Base URL" className="mb-4">
                                    <Input value={selectedChannel.baseUrl} onChange={(event) => updateCustomChannel({ baseUrl: event.target.value })} />
                                </Form.Item>
                                <Form.Item label="API Key" className="mb-4">
                                    <Input.Password value={selectedChannel.apiKey} onChange={(event) => updateCustomChannel({ apiKey: event.target.value })} />
                                </Form.Item>
                            </div>

                            <Form.Item label="渠道模型" className="mb-5">
                                <div className="flex items-start gap-2">
                                    <Select
                                        mode="tags"
                                        showSearch
                                        allowClear
                                        maxTagCount="responsive"
                                        tokenSeparators={[",", "\n"]}
                                        className="min-w-0 flex-1"
                                        placeholder="输入模型名称或从上游拉取"
                                        value={selectedChannel.models}
                                        options={channelModelOptions}
                                        onChange={updateChannelModels}
                                    />
                                    <Button icon={<RefreshCw className="size-4" />} loading={loadingChannelId === selectedChannel.id} onClick={() => void refreshModels()}>
                                        拉取模型
                                    </Button>
                                </div>
                            </Form.Item>

                            <div className="mb-5 grid gap-4 md:grid-cols-2">
                                {visibleModelGroups.map((group) => (
                                    <Form.Item key={group.modelsKey} label={group.optionsLabel} className="mb-0">
                                        <Select
                                            mode="multiple"
                                            showSearch
                                            allowClear
                                            maxTagCount="responsive"
                                            placeholder={selectedChannel.models.length ? `请选择${group.optionsLabel}` : "请先在上方选择渠道模型"}
                                            value={selectedChannel[group.modelsKey]}
                                            options={selectedModelOptions}
                                            onChange={(models) => updateCapabilityModels(group, models)}
                                        />
                                    </Form.Item>
                                ))}
                            </div>
                        </>
                    ) : effectiveMode === "remote" ? (
                        <div className="mb-5 text-sm text-muted-foreground">
                            {canUseLocalChannel ? "当前使用系统后台渠道转发请求" : "管理员未开放自定义渠道"}，当前可用 {modelChannel?.availableModels.length || 0} 个模型。
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {modelGroups.map((group) => (
                            <Form.Item key={group.modelKey} label={group.defaultLabel} className="mb-4">
                                {effectiveMode === "local" ? (
                                    <Select
                                        showSearch
                                        allowClear
                                        placeholder="选择渠道和模型"
                                        value={config[group.channelKey] && config[group.modelKey] ? encodeBinding(config[group.channelKey], config[group.modelKey]) : undefined}
                                        options={bindingOptions(group)}
                                        onChange={(value) => updateBinding(group, value)}
                                    />
                                ) : (
                                    <ModelPicker config={effectiveConfig} value={effectiveConfig[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth />
                                )}
                            </Form.Item>
                        ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                        <Form.Item label="画布默认生图张数" className="mb-4">
                            <Input
                                type="number"
                                min={1}
                                max={15}
                                value={config.canvasImageCount}
                                onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                            />
                        </Form.Item>
                        <Form.Item label="默认音频声音" className="mb-4">
                            <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                        </Form.Item>
                        <Form.Item label="默认音频格式" className="mb-4">
                            <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                        </Form.Item>
                        <Form.Item label="默认音频语速" className="mb-4">
                            <Input
                                type="number"
                                min={0.25}
                                max={4}
                                step={0.05}
                                value={config.audioSpeed}
                                onChange={(event) => updateConfig("audioSpeed", event.target.value)}
                                onBlur={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                            />
                        </Form.Item>
                    </div>
                    <Form.Item label="默认音频指令" className="mb-4">
                        <Input.TextArea rows={2} value={config.audioInstructions} placeholder="例如：自然、温暖、适合旁白。" onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                    </Form.Item>
                    {effectiveMode === "local" ? (
                        <Form.Item label="系统提示词" className="mb-0">
                            <Input.TextArea rows={3} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                        </Form.Item>
                    ) : null}
                </Form>
            </div>
        </Modal>
    );
}

function createCustomChannel(index: number): CustomAiChannel {
    return {
        id: nanoid(),
        name: `渠道 ${index}`,
        protocol: "openai",
        baseUrl: "",
        apiKey: "",
        models: [],
        imageModels: [],
        videoModels: [],
        textModels: [],
        audioModels: [],
    };
}

function encodeBinding(channelId: string, model: string) {
    return `${channelId}::${model}`;
}

function decodeBinding(value: string) {
    const separator = value.indexOf("::");
    return separator < 0 ? { channelId: "", model: value } : { channelId: value.slice(0, separator), model: value.slice(separator + 2) };
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}

function uniqueModels(models: string[]) {
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}
