import type { CanvasResourceReference } from "./canvas-resource-references";
import type { SeedanceImageRole } from "@/types/image";

export const CANVAS_RESOURCE_MENTION_TOKEN_PATTERN = /@\[node:([^;\]]+)(?:;role:(reference_image|first_frame|last_frame))?\]/g;

export const CANVAS_SEEDANCE_IMAGE_ROLES: Array<{ value: SeedanceImageRole; label: string; description: string }> = [
    { value: "reference_image", label: "参考图", description: "作为人物、物体或场景参考" },
    { value: "first_frame", label: "首帧", description: "作为生成视频的起始画面" },
    { value: "last_frame", label: "尾帧", description: "作为结束画面，必须同时设置首帧" },
];

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
