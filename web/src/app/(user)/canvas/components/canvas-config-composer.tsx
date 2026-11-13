"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { Button, Image } from "antd";
import { FileText, Image as ImageIcon, Music2, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { SeedanceImageRole } from "@/types/image";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { CANVAS_RESOURCE_MENTION_TOKEN_PATTERN, CANVAS_SEEDANCE_IMAGE_ROLES, canvasResourceMentionLabels, canvasResourceMentionRoleLabel, seedanceMentionResourceDisabledReason, seedanceMentionResourceWarning, seedanceMentionRoleDisabledReason, seedanceMentionRoleWarning } from "../utils/canvas-resource-mention-format";
import { matchesCanvasReferenceQuery, readCanvasReferenceMention, shouldResetCanvasReferenceSelection } from "../utils/canvas-resource-query";

type CanvasConfigComposerProps = {
    value: string;
    inputs: NodeGenerationInput[];
    onChange: (value: string) => void;
    onClose: () => void;
    seedanceModel?: string;
};

type Token =
    | { type: "text"; value: string }
    | { type: "reference"; nodeId: string; role?: SeedanceImageRole };

type MentionState = {
    start: number;
    query: string;
};

export const CONFIG_REFERENCE_PATTERN = CANVAS_RESOURCE_MENTION_TOKEN_PATTERN;

export function CanvasConfigComposer({ value, inputs, onChange, onClose, seedanceModel = "" }: CanvasConfigComposerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement>(null);
    const composingRef = useRef(false);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [roleReference, setRoleReference] = useState<NodeGenerationInput | null>(null);
    const tokens = useMemo(() => parseComposerTokens(value), [value]);
    const referenceById = useMemo(() => new Map(inputs.map((input) => [input.nodeId, input])), [inputs]);
    const mentionResources = useMemo(() => inputs.map((input) => ({ nodeId: input.nodeId, kind: input.type, width: input.image?.width, height: input.image?.height, durationMs: input.video?.durationMs || input.audio?.durationMs })), [inputs]);
    const labelsByNodeId = useMemo(() => canvasResourceMentionLabels(value, mentionResources), [mentionResources, value]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = (mention.query || "").trim().toLowerCase();
        if (!query) return inputs;
        return inputs.filter((input) => matchesCanvasReferenceQuery([resourceLabel(input, inputs), input.title, input.type, input.text || ""], query));
    }, [inputs, mention]);

    useEffect(() => {
        if (document.activeElement === editorRef.current) return;
        const editor = editorRef.current;
        if (!editor) return;
        editor.textContent = "";
        tokens.forEach((token) => {
            if (token.type === "text") {
                editor.append(document.createTextNode(token.value));
                return;
            }
            const input = referenceById.get(token.nodeId);
            if (input) editor.append(createReferenceChip(input, theme, setImagePreview, token.role, labelsByNodeId.get(input.nodeId) || resourceLabel(input, inputs)));
        });
    }, [inputs, labelsByNodeId, referenceById, theme, tokens]);

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const next = serializeEditor(editor);
        refreshReferenceChipLabels(editor, referenceById);
        onChange(next);
        syncMention();
    };

    const syncMention = () => {
        const text = textBeforeCaret();
        const nextMention = readCanvasReferenceMention(text, text.length);
        if (!nextMention || !inputs.length) {
            closeMention();
            return;
        }
        if (shouldResetCanvasReferenceSelection(mention, nextMention)) setActiveIndex(0);
        setMention(nextMention);
    };

    const closeMention = () => {
        setMention(null);
        setRoleReference(null);
        setActiveIndex(0);
    };

    const insertReference = (input: NodeGenerationInput, role?: SeedanceImageRole) => {
        const editor = editorRef.current;
        if (!editor) return;
        removeActiveMention();
        const chip = createReferenceChip(input, theme, setImagePreview, role, resourceLabel(input, inputs));
        const space = document.createTextNode(" ");
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
        }
        closeMention();
        const nextValue = serializeEditor(editor);
        refreshReferenceChipLabels(editor, referenceById);
        onChange(nextValue);
    };

    const selectReference = (input: NodeGenerationInput) => {
        if (seedanceModel) {
            const disabledReason = seedanceMentionResourceDisabledReason(value, mentionResources, { nodeId: input.nodeId, kind: input.type }, seedanceModel);
            if (disabledReason) return;
        }
        if (seedanceModel && input.type === "image") {
            setRoleReference(input);
            setActiveIndex(0);
            return;
        }
        insertReference(input);
    };

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={stopCanvasInteraction}
            onPointerDown={stopCanvasInteraction}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <div className="shrink-0 text-xs font-semibold">组装提示词</div>
                    <div className="truncate text-[11px] opacity-55">@ 引用已连接素材，编号按当前连接顺序固定</div>
                </div>
                <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<X className="size-3.5" />} onClick={onClose} />
            </div>
            <div className="relative rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                {!value.trim() ? <div className="pointer-events-none absolute left-3 top-2 text-sm leading-7" style={{ color: theme.node.placeholder }}>输入提示词，按 @ 引用连接的图片或文本</div> : null}
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="thin-scrollbar min-h-28 w-full overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm leading-7 outline-none"
                    style={{ color: theme.node.text, caretColor: theme.node.text, WebkitTextFillColor: theme.node.text }}
                    onInput={() => {
                        if (!composingRef.current) syncFromEditor();
                    }}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                        composingRef.current = false;
                        syncFromEditor();
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        event.stopPropagation();
                        if (mention && roleReference) {
                            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                event.preventDefault();
                                const offset = event.key === "ArrowDown" ? 1 : -1;
                                setActiveIndex((index) => (index + offset + CANVAS_SEEDANCE_IMAGE_ROLES.length) % CANVAS_SEEDANCE_IMAGE_ROLES.length);
                                return;
                            }
                            if (event.key === "Enter") {
                                event.preventDefault();
                                const role = CANVAS_SEEDANCE_IMAGE_ROLES[Math.min(activeIndex, CANVAS_SEEDANCE_IMAGE_ROLES.length - 1)].value;
                                if (!seedanceMentionRoleDisabledReason(value, mentionResources, { nodeId: roleReference.nodeId, kind: roleReference.type }, role, seedanceModel)) insertReference(roleReference, role);
                                return;
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                setRoleReference(null);
                                setActiveIndex(0);
                                return;
                            }
                        }
                        if (mention && candidates.length) {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setActiveIndex((index) => (index + 1) % candidates.length);
                                return;
                            }
                            if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                                return;
                            }
                            if (event.key === "Enter") {
                                event.preventDefault();
                                selectReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                                return;
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                closeMention();
                                return;
                            }
                        }
                        if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) {
                            event.preventDefault();
                            requestAnimationFrame(syncFromEditor);
                            return;
                        }
                        requestAnimationFrame(syncMention);
                    }}
                    onKeyUp={syncMention}
                    onClick={syncMention}
                    onFocus={syncMention}
                    onMouseUp={syncMention}
                    onBlur={() => window.setTimeout(closeMention, 120)}
                />
                {mention && roleReference ? <RoleMenu input={roleReference} activeIndex={Math.min(activeIndex, CANVAS_SEEDANCE_IMAGE_ROLES.length - 1)} theme={theme} disabledReason={(role) => seedanceMentionRoleDisabledReason(value, mentionResources, { nodeId: roleReference.nodeId, kind: roleReference.type }, role, seedanceModel)} warning={(role) => seedanceMentionRoleWarning(value, mentionResources, { nodeId: roleReference.nodeId, kind: roleReference.type }, role, seedanceModel)} onSelect={(role) => insertReference(roleReference, role)} /> : mention && candidates.length ? <MentionMenu inputs={candidates} allInputs={inputs} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} disabledReason={(input) => seedanceModel ? seedanceMentionResourceDisabledReason(value, mentionResources, { nodeId: input.nodeId, kind: input.type }, seedanceModel) : ""} warning={(input) => seedanceModel ? seedanceMentionResourceWarning(value, mentionResources, { nodeId: input.nodeId, kind: input.type }, seedanceModel) : ""} onSelect={selectReference} /> : null}
            </div>
            {imagePreview ? <Image src={imagePreview} alt="引用图片预览" style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );

}

function RoleMenu({ input, activeIndex, theme, disabledReason, warning, onSelect }: { input: NodeGenerationInput; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabledReason: (role: SeedanceImageRole) => string; warning: (role: SeedanceImageRole) => string; onSelect: (role: SeedanceImageRole) => void }) {
    const selectedRef = useRef(false);
    const selectRole = (role: SeedanceImageRole) => {
        if (selectedRef.current || disabledReason(role)) return;
        selectedRef.current = true;
        onSelect(role);
    };

    return (
        <div className="absolute left-2 top-[calc(100%+6px)] z-[90] w-64 rounded-xl border p-1 shadow-2xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
            <div className="px-2 py-1 text-[11px] opacity-55">{input.title} 用作</div>
            {CANVAS_SEEDANCE_IMAGE_ROLES.map((role, index) => {
                const reason = disabledReason(role.value);
                const hint = warning(role.value);
                return (
                    <button key={role.value} type="button" disabled={Boolean(reason)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40" style={{ background: !reason && index === activeIndex ? theme.toolbar.activeBg : "transparent", color: !reason && index === activeIndex ? theme.toolbar.activeText : theme.node.text }} title={reason || hint} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); selectRole(role.value); }}>
                        <span className="block font-medium">{role.label}</span>
                        <span className="block opacity-60">{reason || hint || role.description}</span>
                    </button>
                );
            })}
        </div>
    );
}

function MentionMenu({ inputs, allInputs, activeIndex, theme, disabledReason, warning, onSelect }: { inputs: NodeGenerationInput[]; allInputs: NodeGenerationInput[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabledReason: (input: NodeGenerationInput) => string; warning: (input: NodeGenerationInput) => string; onSelect: (input: NodeGenerationInput) => void }) {
    const selectedRef = useRef(false);
    const selectInput = (input: NodeGenerationInput) => {
        if (selectedRef.current || disabledReason(input)) return;
        selectedRef.current = true;
        onSelect(input);
    };

    return (
        <div className="absolute left-2 top-[calc(100%+6px)] z-[90] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
            {inputs.map((input, index) => {
                const reason = disabledReason(input);
                const hint = warning(input);
                return <button
                    key={input.nodeId}
                    type="button"
                    disabled={Boolean(reason)}
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: !reason && index === activeIndex ? theme.toolbar.activeBg : "transparent", color: !reason && index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    title={reason || hint}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectInput(input);
                    }}
                >
                    <ResourcePreview input={input} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{resourceLabel(input, allInputs)}</span>
                        <span className="block truncate opacity-65">{reason || hint || input.text || input.title}</span>
                    </span>
                </button>
            })}
        </div>
    );
}

function ResourcePreview({ input }: { input: NodeGenerationInput }) {
    if (input.type === "image" && input.image) return <img src={input.image.dataUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (input.type === "video" && input.video) return <video src={input.video.url} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = input.type === "audio" ? Music2 : input.type === "video" ? Video : input.type === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function createReferenceChip(input: NodeGenerationInput, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void, role: SeedanceImageRole | undefined, label: string) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.referenceNodeId = input.nodeId;
    wrapper.dataset.referenceKind = input.type;
    if (role) wrapper.dataset.referenceRole = role;
    wrapper.className = "mx-px inline-flex h-7 max-w-40 items-center justify-center gap-1 overflow-hidden rounded-md border px-1.5 text-xs leading-none align-middle";
    Object.assign(wrapper.style, chipStyle(theme));
    wrapper.title = input.text || input.title;
    if (input.type === "image" && input.image) {
        const image = document.createElement("img");
        image.src = input.image.dataUrl;
        image.alt = input.title;
        image.className = "size-5 shrink-0 rounded object-cover";
        wrapper.appendChild(image);
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(input.image?.dataUrl || "");
        });
    }
    const text = document.createElement("span");
    text.dataset.referenceLabel = "true";
    text.className = "block truncate font-medium";
    const roleLabel = canvasResourceMentionRoleLabel(role);
    text.textContent = `@${label}${roleLabel ? ` · ${roleLabel}` : ""}`;
    wrapper.appendChild(text);
    return wrapper;
}

function refreshReferenceChipLabels(editor: HTMLElement, referenceById: Map<string, NodeGenerationInput>) {
    const inputs = Array.from(referenceById.values());
    const labels = canvasResourceMentionLabels(serializeEditor(editor), inputs.map((input) => ({ nodeId: input.nodeId, kind: input.type })));
    editor.querySelectorAll<HTMLElement>("[data-reference-node-id]").forEach((chip) => {
        const nodeId = chip.dataset.referenceNodeId || "";
        const input = referenceById.get(nodeId);
        if (!input) return;
        const label = labels.get(nodeId) || resourceLabel(input, inputs);
        const text = chip.querySelector<HTMLElement>("[data-reference-label]");
        const roleLabel = canvasResourceMentionRoleLabel(chip.dataset.referenceRole as SeedanceImageRole | undefined);
        if (text) text.textContent = `@${label}${roleLabel ? ` · ${roleLabel}` : ""}`;
    });
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/\uFEFF/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode>) {
    let result = "";
    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) result += node.textContent || "";
        if (!(node instanceof HTMLElement)) return;
        const nodeId = node.dataset.referenceNodeId;
        const role = node.dataset.referenceRole;
        if (nodeId) result += `@[node:${nodeId}${role ? `;role:${role}` : ""}]`;
        else if (node.tagName === "BR") result += "\n";
        else result += serializeNodes(node.childNodes);
    });
    return result;
}

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = textBeforeCaret();
    const mention = readCanvasReferenceMention(text, text.length);
    if (!mention) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - mention.query.length - 1));
    range.deleteContents();
}

function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const target = adjacentReferenceNode(range, key);
    if (!target) return false;
    const nextCaretNode = document.createTextNode("");
    target.replaceWith(nextCaretNode);
    range.setStart(nextCaretNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function adjacentReferenceNode(range: Range, key: string) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && offset > 0) || (!previous && offset < text.length)) return null;
        return findReferenceSibling(container, previous);
    }
    const children = Array.from(container.childNodes);
    return findReferenceSibling(children[previous ? offset - 1 : offset] || container, previous, true);
}

function findReferenceSibling(node: Node, previous: boolean, includeSelf = false): HTMLElement | null {
    let current: Node | null = includeSelf ? node : previous ? node.previousSibling : node.nextSibling;
    while (current && current.nodeType === Node.TEXT_NODE && !(current.textContent || "").trim()) current = previous ? current.previousSibling : current.nextSibling;
    return current instanceof HTMLElement && current.dataset.referenceNodeId ? current : null;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = closestEditor(range.startContainer);
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function closestEditor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("[contenteditable='true']") || null;
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function parseComposerTokens(value: string): Token[] {
    const tokens: Token[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(CONFIG_REFERENCE_PATTERN)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", nodeId: match[1], role: match[2] as SeedanceImageRole | undefined });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function resourceLabel(input: NodeGenerationInput, inputs: NodeGenerationInput[]) {
    const sameTypeInputs = inputs.filter((item) => item.type === input.type);
    const index = Math.max(0, sameTypeInputs.findIndex((item) => item.nodeId === input.nodeId));
    if (input.type === "image") return `图片${index + 1}`;
    if (input.type === "video") return `视频${index + 1}`;
    if (input.type === "audio") return `音频${index + 1}`;
    return `文本${index + 1}`;
}

function chipStyle(theme: (typeof canvasThemes)[keyof typeof canvasThemes]): CSSProperties {
    return { background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.toolbar.activeText };
}
