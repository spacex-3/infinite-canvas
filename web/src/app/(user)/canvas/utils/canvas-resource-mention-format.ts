import type { CanvasResourceReference } from "./canvas-resource-references";

export const CANVAS_RESOURCE_MENTION_TOKEN_PATTERN = /@\[node:([^\]]+)\]/g;

export function canvasResourceMentionToken(reference: CanvasResourceReference) {
    return `@[node:${reference.nodeId}]`;
}

export function renderCanvasResourceMentionText(value: string, references: CanvasResourceReference[]) {
    if (!value) return value;
    const labelByNodeId = new Map(references.map((reference) => [reference.nodeId, reference.label]));
    return value.replace(CANVAS_RESOURCE_MENTION_TOKEN_PATTERN, (token, nodeId: string) => labelByNodeId.get(nodeId) || token);
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
