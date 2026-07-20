"use client";

import { App, Button, Form, Input, Modal, Segmented, Select, Tag } from "antd";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { fetchImageModels } from "@/services/api/image";
import {
    applyPreferredModelsToChannel,
    canUseCustomChannel,
    preferredDefaultForChannel,
    useConfigStore,
    useEffectiveConfig,
    ZPIKA_BASE_URL,
    ZPIKA_DIRECT_BASE_URL,
    ZPIKA_GROUP_IDS,
    type AiConfig,
    type CustomAiChannel,
    type ModelCapability,
} from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    modelsKey: "imageModels" | "videoModels" | "textModels" | "audioModels";
    channelKey: "imageChannelId" | "videoChannelId" | "textChannelId" | "audioChannelId";
    defaultLabel: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", modelsKey: "imageModels", channelKey: "imageChannelId", defaultLabel: "默认生图渠道 / 模型" },
    { capability: "video", modelKey: "videoModel", modelsKey: "videoModels", channelKey: "videoChannelId", defaultLabel: "默认视频渠道 / 模型" },
    { capability: "text", modelKey: "textModel", modelsKey: "textModels", channelKey: "textChannelId", defaultLabel: "默认文本渠道 / 模型" },
    { capability: "audio", modelKey: "audioModel", modelsKey: "audioModels", channelKey: "audioChannelId", defaultLabel: "默认音频渠道 / 模型" },
];

const protocolLabel: Record<CustomAiChannel["protocol"], string> = {
    openai: "OpenAI 兼容",
    gemini: "Gemini 原生图片",
    fpbrowser2api: "zpika-veo-omni-flash",
    zerofall: "zpika-omni-flash",
};

const groupCapabilityLabel: Record<string, string> = {
    [ZPIKA_GROUP_IDS.text]: "文字 / 音频",
    [ZPIKA_GROUP_IDS.openaiImage]: "OpenAI 画图",
    [ZPIKA_GROUP_IDS.geminiImage]: "Gemini 画图",
    [ZPIKA_GROUP_IDS.video]: "Gemini 视频",
};

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
    const configuredChannels = config.customChannels.filter((channel) => channel.apiKey.trim() && channel.models.length);
    const channelModelOptions = uniqueModels([...(selectedChannel?.models || []), ...(fetchedModels[activeChannelId] || [])]).map((model) => ({ label: model, value: model }));
    const hostHint = selectedChannel?.hostMode === "direct" ? ZPIKA_DIRECT_BASE_URL : ZPIKA_BASE_URL;
    const preferredHints = selectedChannel?.preferredModels || [];

    const finishConfig = () => {
        if (effectiveMode === "local" && !configuredChannels.length) {
            message.error("请至少完整配置一个分组：填写 API Key 并选择模型");
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

    const refreshModels = async () => {
        if (!selectedChannel) return;
        if (!selectedChannel.apiKey.trim()) {
            message.error("请先填写该分组的 API Key");
            return;
        }
        setLoadingChannelId(selectedChannel.id);
        try {
            // Model list fetch always goes through vip to avoid Cloudflare timeouts on long generation hosts.
            const requestConfig = {
                ...effectiveConfig,
                channelMode: "local" as const,
                protocol: selectedChannel.protocol,
                baseUrl: ZPIKA_BASE_URL,
                apiKey: selectedChannel.apiKey,
                model: selectedChannel.models[0] || preferredDefaultForChannel(selectedChannel),
            };
            const models = uniqueModels(await fetchImageModels(requestConfig));
            setFetchedModels((current) => ({ ...current, [selectedChannel.id]: models }));
            const patched = applyPreferredModelsToChannel(selectedChannel, models);
            updateCustomChannel(patched);
            applyDefaultBindingAfterFetch(selectedChannel.id, patched);
            const preferredHit = (selectedChannel.preferredModels || []).filter((model) => models.includes(model));
            message.success(preferredHit.length ? `已获取 ${models.length} 个模型，并自动选中推荐 ${preferredHit.length} 个` : `已获取 ${models.length} 个模型，请手动选择`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingChannelId("");
        }
    };

    const applyDefaultBindingAfterFetch = (channelId: string, channel: CustomAiChannel) => {
        const preferred = preferredDefaultForChannel(channel);
        if (channel.id === ZPIKA_GROUP_IDS.geminiImage || channel.id === ZPIKA_GROUP_IDS.openaiImage) {
            if (!channel.imageModels.length) return;
            if (config.imageChannelId && config.imageChannelId !== channelId && config.imageModel) return;
            const model = channel.imageModels.includes(preferred) ? preferred : channel.imageModels[0];
            updateConfig("imageChannelId", channelId);
            updateConfig("imageModel", model);
            return;
        }
        if (channel.id === ZPIKA_GROUP_IDS.video) {
            if (!channel.videoModels.length) return;
            if (config.videoChannelId && config.videoChannelId !== channelId && config.videoModel) return;
            const model = channel.videoModels.includes(preferred) ? preferred : channel.videoModels[0];
            updateConfig("videoChannelId", channelId);
            updateConfig("videoModel", model);
            return;
        }
        if (channel.id === ZPIKA_GROUP_IDS.text) {
            if (channel.textModels.length && (!config.textChannelId || config.textChannelId === channelId || !config.textModel)) {
                const model = channel.textModels.includes(preferred) ? preferred : channel.textModels[0];
                updateConfig("textChannelId", channelId);
                updateConfig("textModel", model);
            }
            if (channel.audioModels.length && (!config.audioChannelId || config.audioChannelId === channelId || !config.audioModel)) {
                updateConfig("audioChannelId", channelId);
                updateConfig("audioModel", channel.audioModels[0]);
            }
        }
    };

    const updateChannelModels = (models: string[]) => {
        if (!selectedChannel) return;
        const next = uniqueModels(models);
        const patch = applyPreferredModelsToChannel({ ...selectedChannel, models: next }, next);
        // Keep exact user selection when editing tags manually.
        if (selectedChannel.id === ZPIKA_GROUP_IDS.geminiImage || selectedChannel.id === ZPIKA_GROUP_IDS.openaiImage) {
            patch.models = next;
            patch.imageModels = next;
            patch.videoModels = [];
            patch.textModels = [];
            patch.audioModels = [];
        } else if (selectedChannel.id === ZPIKA_GROUP_IDS.video) {
            patch.models = next;
            patch.videoModels = next;
            patch.imageModels = [];
            patch.textModels = [];
            patch.audioModels = [];
        } else {
            patch.models = next;
            patch.textModels = next.filter((model) => !isLikelyAudioModel(model));
            patch.audioModels = next.filter((model) => isLikelyAudioModel(model));
            patch.imageModels = [];
            patch.videoModels = [];
        }
        updateCustomChannel(patch);
        syncBindingsAfterModelChange(selectedChannel.id, patch);
    };

    const syncBindingsAfterModelChange = (channelId: string, channel: CustomAiChannel) => {
        for (const group of modelGroups) {
            if (config[group.channelKey] !== channelId) continue;
            if (!channel[group.modelsKey].includes(config[group.modelKey])) {
                updateConfig(group.modelKey, channel[group.modelsKey][0] || "");
            }
        }
    };

    const bindingOptions = useMemo(
        () =>
            modelGroups.map((group) => ({
                group,
                options: config.customChannels.flatMap((channel) =>
                    channel[group.modelsKey].map((model) => ({
                        label: `${channel.name} / ${model}`,
                        value: encodeBinding(channel.id, model),
                    })),
                ),
            })),
        [config.customChannels],
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
                    <div className="mt-1 text-xs font-normal text-muted-foreground">Zpika 双域名预设分组：文字走 vip，图片/视频走 aivideo</div>
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
                            <div className="mb-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                <div>
                                    拉取模型域名（固定）：<span className="font-medium text-foreground">{ZPIKA_BASE_URL}</span>
                                </div>
                                <div className="mt-1">
                                    图片/视频生成域名（固定）：<span className="font-medium text-foreground">{ZPIKA_DIRECT_BASE_URL}</span>
                                </div>
                                <div className="mt-1">当前分组请求域名：{hostHint}</div>
                            </div>

                            <div className="mb-4">
                                <Select
                                    className="w-full"
                                    value={selectedChannel.id}
                                    options={config.customChannels.map((channel) => ({
                                        label: `${channel.name}${channel.apiKey.trim() ? "" : "（未配置 Key）"}`,
                                        value: channel.id,
                                    }))}
                                    onChange={setSelectedChannelId}
                                />
                            </div>

                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <Tag color="blue">{groupCapabilityLabel[selectedChannel.id] || selectedChannel.name}</Tag>
                                <Tag>{protocolLabel[selectedChannel.protocol]}</Tag>
                                <Tag color={selectedChannel.hostMode === "direct" ? "purple" : "green"}>{selectedChannel.hostMode === "direct" ? "生成走 aivideo" : "文字/拉取走 vip"}</Tag>
                            </div>

                            <Form.Item label="API Key" className="mb-4" extra="每个分组通常对应中转站不同套餐 Key，请分别填写。">
                                <Input.Password value={selectedChannel.apiKey} onChange={(event) => updateCustomChannel({ apiKey: event.target.value })} placeholder="sk-..." />
                            </Form.Item>

                            <Form.Item
                                label="分组模型"
                                className="mb-5"
                                extra={preferredHints.length ? `推荐优先：${preferredHints.join("、")}（拉取后若上游有则自动勾选）` : "可手动输入模型名，或先拉取上游完整列表"}
                            >
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
                        </>
                    ) : effectiveMode === "remote" ? (
                        <div className="mb-5 text-sm text-muted-foreground">
                            {canUseLocalChannel ? "当前使用系统后台渠道转发请求" : "管理员未开放自定义渠道"}，当前可用 {modelChannel?.availableModels.length || 0} 个模型。
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {bindingOptions.map(({ group, options }) => (
                            <Form.Item key={group.modelKey} label={group.defaultLabel} className="mb-4">
                                {effectiveMode === "local" ? (
                                    <Select
                                        showSearch
                                        allowClear
                                        placeholder="选择渠道和模型"
                                        value={config[group.channelKey] && config[group.modelKey] ? encodeBinding(config[group.channelKey], config[group.modelKey]) : undefined}
                                        options={options}
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

function isLikelyAudioModel(model: string) {
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}
