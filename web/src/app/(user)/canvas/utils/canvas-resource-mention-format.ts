import type { CanvasResourceReference } from "./canvas-resource-references";
import { isSeedance25Model, seedanceReferenceLimitsForModel } from "@/lib/seedance-video";
import type { SeedanceImageRole } from "@/types/image";
import type { CanvasResourceKind } from "./canvas-resource-references";

export const CANVAS_RESOURCE_MENTION_TOKEN_PATTERN = /@\[node:([^;\]]+)(?:;role:(reference_image|first_frame|last_frame))?\]/g;

export const CANVAS_SEEDANCE_IMAGE_ROLES: Array<{ value: SeedanceImageRole; label: string; description: string }> = [
    { value: "reference_image", label: "参考图", description: "作为人物、物体或场景参考" },
    { value: "first_frame", label: "首帧", description: "作为生成视频的起始画面" },
    { value: "last_frame", label: "尾帧", description: "作为结束画面，部分线路可能要求同时设置首帧" },
];

export type CanvasResourceMentionToken = { nodeId: string; role?: SeedanceImageRole };
export type CanvasMentionResource = { nodeId: string; kind: CanvasResourceKind; width?: number; height?: number; durationMs?: number };

export function parseCanvasResourceMentionTokens(value: string): CanvasResourceMentionToken[] {
    return Array.from(value.matchAll(CANVAS_RESOURCE_MENTION_TOKEN_PATTERN), (match) => ({ nodeId: match[1], role: match[2] as SeedanceImageRole | undefined }));
}

export function hasSeedanceFrameMention(value: string) {
    return /@\[node:[^;\]]+;role:(?:first_frame|last_frame)\]/.test(value);
}

export function canvasResourceMentionLabels(value: string, resources: CanvasMentionResource[]) {
    const mentionedNodeIds = new Set(parseCanvasResourceMentionTokens(value).map((token) => token.nodeId));
    const labels = new Map<string, string>();
    const seenNodeIds = new Set<string>();
    const counts: Record<CanvasResourceKind, number> = { image: 0, video: 0, audio: 0, text: 0 };
    for (const resource of resources) {
        if (seenNodeIds.has(resource.nodeId)) continue;
        seenNodeIds.add(resource.nodeId);
        const label = canvasMentionLabel(resource.kind, counts[resource.kind]++);
        if (mentionedNodeIds.has(resource.nodeId)) labels.set(resource.nodeId, label);
    }
    return labels;
}

export function seedanceMentionResourceDisabledReason(value: string, resources: CanvasMentionResource[], resource: CanvasMentionResource, model: string) {
    void value;
    void resources;
    void resource;
    void model;
    return "";
}

export function seedanceMentionResourceWarning(value: string, resources: CanvasMentionResource[], resource: CanvasMentionResource, model: string) {
    if (resource.kind === "text" || resource.kind === "image") return "";
    const state = seedanceMentionState(value, resources);
    if (state.hasFrames) return "首尾帧与普通参考素材混用尚未验证，仍可提交";
    if (state.nodeIds.has(resource.nodeId)) return "";
    if ((resource.kind === "video" || resource.kind === "audio") && resource.durationMs && (resource.durationMs < 2000 || resource.durationMs > 15000)) return "素材时长超出当前线路已验证的 2-15 秒，仍可提交";
    if (resource.kind === "video" && resource.durationMs && state.videoDurationMs + resource.durationMs > 15000) return "参考视频总时长超出当前线路已验证的 15 秒，仍可提交";
    if (resource.kind === "audio" && resource.durationMs && state.audioDurationMs + resource.durationMs > 15000) return "参考音频总时长超出当前线路已验证的 15 秒，仍可提交";
    const limits = seedanceReferenceLimitsForModel(model);
    const nextKindCount = resource.kind === "video" ? state.videos + 1 : state.audios + 1;
    const kindLimit = resource.kind === "video" ? limits.videos : limits.audios;
    if (nextKindCount > kindLimit) return `已超过当前线路验证的 ${kindLimit} 个参考${resource.kind === "video" ? "视频" : "音频"}，仍可提交`;
    if (state.images + state.videos + state.audios + 1 > limits.total) return `已超过当前线路验证的 ${limits.total} 项参考素材，仍可提交`;
    return "";
}

export function seedanceMentionRoleDisabledReason(value: string, resources: CanvasMentionResource[], resource: CanvasMentionResource, role: SeedanceImageRole, model: string) {
    void value;
    void resources;
    void resource;
    void role;
    void model;
    return "";
}

export function seedanceMentionRoleWarning(value: string, resources: CanvasMentionResource[], resource: CanvasMentionResource, role: SeedanceImageRole, model: string) {
    const state = seedanceMentionState(value, resources);
    const existingRole = state.rolesByNodeId.get(resource.nodeId);
    if (existingRole && existingRole !== role) return `同一图片已用作${seedanceRoleLabel(existingRole)}，多角色组合未验证，仍可提交`;
    if (role === "reference_image" && state.hasFrames) return "首尾帧与普通参考图混用尚未验证，仍可提交";
    if (role !== "reference_image" && state.hasOrdinaryReferences) return "首尾帧与普通参考素材混用尚未验证，仍可提交";
    if (role === "first_frame" && state.firstFrameNodeId && state.firstFrameNodeId !== resource.nodeId) return "多个首帧尚未验证，实际以上游返回为准";
    if (role === "last_frame" && !state.firstFrameNodeId) return "单独尾帧尚未验证，部分线路可能要求同时设置首帧";
    if (role === "last_frame" && state.lastFrameNodeId && state.lastFrameNodeId !== resource.nodeId) return "多个尾帧尚未验证，实际以上游返回为准";
    const pairedFrameNodeId = role === "first_frame" ? state.lastFrameNodeId : role === "last_frame" ? state.firstFrameNodeId : "";
    const pairedFrame = resources.find((item) => item.nodeId === pairedFrameNodeId);
    if (pairedFrame && resource.width && resource.height && pairedFrame.width && pairedFrame.height && (resource.width !== pairedFrame.width || resource.height !== pairedFrame.height)) {
        return `首尾帧尺寸不同（${resource.width}x${resource.height} / ${pairedFrame.width}x${pairedFrame.height}），仍可提交`;
    }
    if (state.nodeIds.has(resource.nodeId)) return "";
    const limits = seedanceReferenceLimitsForModel(model);
    if (state.images + 1 > limits.images) return `已超过当前线路验证的 ${limits.images} 张参考图片，仍可提交`;
    if (state.images + state.videos + state.audios + 1 > limits.total) return `已超过当前线路验证的 ${limits.total} 项参考素材，仍可提交`;
    if (role !== "reference_image" && !isSeedance25Model(model)) return "当前线路未验证该模型的首尾帧能力，实际以上游返回为准";
    if (role !== "reference_image") return "当前线路已有首尾帧成功记录；当前组合仍以上游返回为准";
    return "";
}

function seedanceMentionState(value: string, resources: CanvasMentionResource[]) {
    const resourceByNodeId = new Map(resources.map((resource) => [resource.nodeId, resource]));
    const nodeIds = new Set<string>();
    const rolesByNodeId = new Map<string, SeedanceImageRole>();
    let images = 0;
    let videos = 0;
    let audios = 0;
    let firstFrameNodeId = "";
    let lastFrameNodeId = "";
    let videoDurationMs = 0;
    let audioDurationMs = 0;
    let hasOrdinaryReferences = false;
    for (const token of parseCanvasResourceMentionTokens(value)) {
        const resource = resourceByNodeId.get(token.nodeId);
        if (!resource || nodeIds.has(token.nodeId)) continue;
        nodeIds.add(token.nodeId);
        if (resource.kind === "image") {
            images += 1;
            const role = token.role || "reference_image";
            rolesByNodeId.set(token.nodeId, role);
            if (role === "first_frame") firstFrameNodeId = token.nodeId;
            else if (role === "last_frame") lastFrameNodeId = token.nodeId;
            else hasOrdinaryReferences = true;
        } else if (resource.kind === "video") {
            videos += 1;
            videoDurationMs += resource.durationMs || 0;
            hasOrdinaryReferences = true;
        } else if (resource.kind === "audio") {
            audios += 1;
            audioDurationMs += resource.durationMs || 0;
            hasOrdinaryReferences = true;
        }
    }
    return { nodeIds, rolesByNodeId, images, videos, audios, videoDurationMs, audioDurationMs, firstFrameNodeId, lastFrameNodeId, hasFrames: Boolean(firstFrameNodeId || lastFrameNodeId), hasOrdinaryReferences };
}

function seedanceRoleLabel(role: SeedanceImageRole) {
    if (role === "first_frame") return "首帧";
    if (role === "last_frame") return "尾帧";
    return "普通参考图";
}

function canvasMentionLabel(kind: CanvasResourceKind, index: number) {
    if (kind === "image") return `图片${index + 1}`;
    if (kind === "video") return `视频${index + 1}`;
    if (kind === "audio") return `音频${index + 1}`;
    return `文本${index + 1}`;
}

export function canvasResourceMentionToken(reference: CanvasResourceReference, role?: SeedanceImageRole) {
    return `@[node:${reference.nodeId}${role ? `;role:${role}` : ""}]`;
}

export function canvasResourceMentionRoleLabel(role?: SeedanceImageRole) {
    if (role === "first_frame") return "首帧";
    if (role === "last_frame") return "尾帧";
    return "";
}

export function renderCanvasResourceMentionText(value: string, references: CanvasResourceReference[]) {
    if (!value) return value;
    const labelByNodeId = new Map(references.map((reference) => [reference.nodeId, reference.label]));
    return value.replace(CANVAS_RESOURCE_MENTION_TOKEN_PATTERN, (token, nodeId: string, role?: SeedanceImageRole) => {
        const label = labelByNodeId.get(nodeId);
        if (!label) return token;
        const roleLabel = canvasResourceMentionRoleLabel(role);
        return roleLabel ? `${label} · ${roleLabel}` : label;
    });
}

export function canonicalizeCanvasResourceMentionText(value: string, references: CanvasResourceReference[]) {
    if (!value || !references.length) return value;
    const labels = Array.from(new Map(references.map((reference) => [reference.label, reference])).values()).sort((a, b) => b.label.length - a.label.length);
    if (!labels.length) return value;
    const pattern = new RegExp(`(${labels.map((reference) => escapeRegExp(reference.label)).join("|")})`, "g");
    return value.replace(pattern, (label) => {
        const reference = labels.find((item) => item.label === label);
        return reference ? canvasResourceMentionToken(reference) : label;
    });
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
