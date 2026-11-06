"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { SeedanceImageRole } from "@/types/image";
import { CANVAS_RESOURCE_MENTION_TOKEN_PATTERN, CANVAS_SEEDANCE_IMAGE_ROLES, canvasResourceMentionLabels, canvasResourceMentionRoleLabel, seedanceMentionResourceDisabledReason, seedanceMentionRoleDisabledReason } from "../utils/canvas-resource-mention-format";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { matchesCanvasReferenceQuery, readCanvasReferenceMention, shouldResetCanvasReferenceSelection } from "../utils/canvas-resource-query";

type MentionState = {
    start: number;
    query: string;
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "children"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    placeholder?: string;
    containerClassName?: string;
    seedanceModel?: string;
};

export const CanvasResourceMentionTextarea = forwardRef<HTMLDivElement, Props>(function CanvasResourceMentionTextarea({ value, references, onChange, onKeyDown, className, containerClassName, style, placeholder, seedanceModel = "", ...props }, forwardedRef) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement | null>(null);
    const composingRef = useRef(false);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [roleReference, setRoleReference] = useState<CanvasResourceReference | null>(null);
    const referenceByNodeId = useMemo(() => new Map(references.map((reference) => [reference.nodeId, reference])), [references]);
    const activeReferences = useMemo(() => references.filter((reference) => reference.active), [references]);
    const mentionResources = useMemo(() => activeReferences.map((reference) => ({ nodeId: reference.nodeId, kind: reference.kind })), [activeReferences]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((reference) => matchesCanvasReferenceQuery([reference.label, reference.title, reference.kind, reference.text || ""], query));
    }, [activeReferences, mention]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || serializeEditor(editor) === value) return;
        renderEditorValue(editor, value, referenceByNodeId, theme);
    }, [referenceByNodeId, theme, value]);

    const closeMention = () => {
        setMention(null);
        setRoleReference(null);
        setActiveIndex(0);
    };

    const syncMention = () => {
        const text = textBeforeCaret();
        const nextMention = readCanvasReferenceMention(text, text.length);
        if (!nextMention || !activeReferences.length) {
            closeMention();
            return;
        }
        if (shouldResetCanvasReferenceSelection(mention, nextMention)) setActiveIndex(0);
        setMention(nextMention);
    };

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const nextValue = serializeEditor(editor);
        refreshReferenceChipLabels(editor, referenceByNodeId);
        onChange(nextValue);
        syncMention();
    };

    const insertReference = (reference: CanvasResourceReference, role?: SeedanceImageRole) => {
        const editor = editorRef.current;
        if (!editor || !mention) return;
        removeActiveMention();
        const chip = createReferenceChip(reference, theme, role, reference.label);
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
        refreshReferenceChipLabels(editor, referenceByNodeId);
        onChange(nextValue);
    };

    const selectReference = (reference: CanvasResourceReference) => {
        if (seedanceModel) {
            const disabledReason = seedanceMentionResourceDisabledReason(value, mentionResources, { nodeId: reference.nodeId, kind: reference.kind }, seedanceModel);
            if (disabledReason) return;
        }
        if (seedanceModel && reference.kind === "image") {
            setRoleReference(reference);
            setActiveIndex(0);
            return;
        }
        insertReference(reference);
    };

    const mergedStyle = { ...(style || {}), color: style?.color || theme.node.text, caretColor: style?.color || theme.node.text } as CSSProperties;
    const menu = mention && editorRef.current
        ? roleReference
            ? <RoleMenu editor={editorRef.current} reference={roleReference} activeIndex={Math.min(activeIndex, CANVAS_SEEDANCE_IMAGE_ROLES.length - 1)} theme={theme} disabledReason={(role) => seedanceMentionRoleDisabledReason(value, mentionResources, { nodeId: roleReference.nodeId, kind: roleReference.kind }, role, seedanceModel)} onSelect={(role) => insertReference(roleReference, role)} />
            : candidates.length
              ? <MentionMenu editor={editorRef.current} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} disabledReason={(reference) => seedanceModel ? seedanceMentionResourceDisabledReason(value, mentionResources, { nodeId: reference.nodeId, kind: reference.kind }, seedanceModel) : ""} onSelect={selectReference} />
              : null
        : null;

    return (
        <div className={`relative h-full w-full ${containerClassName || ""}`}>
            <div
                {...props}
                ref={(node) => {
                    editorRef.current = node;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                role="textbox"
                aria-multiline="true"
                contentEditable
                suppressContentEditableWarning
                data-placeholder={placeholder || ""}
                className={`${className || ""} empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)] empty:before:opacity-45`}
                style={mergedStyle}
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
                            if (!seedanceMentionRoleDisabledReason(value, mentionResources, { nodeId: roleReference.nodeId, kind: roleReference.kind }, role, seedanceModel)) insertReference(roleReference, role);
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
                    onKeyDown?.(event);
                    requestAnimationFrame(syncMention);
                }}
                onKeyUp={syncMention}
                onClick={syncMention}
                onFocus={syncMention}
                onMouseUp={syncMention}
                onBlur={(event) => {
                    window.setTimeout(closeMention, 120);
                    props.onBlur?.(event);
                }}
            />
            {menu}
        </div>
    );
});

function RoleMenu({ editor, reference, activeIndex, theme, disabledReason, onSelect }: { editor: HTMLDivElement; reference: CanvasResourceReference; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabledReason: (role: SeedanceImageRole) => string; onSelect: (role: SeedanceImageRole) => void }) {
    const selectedRef = useRef(false);
    const rect = editor.getBoundingClientRect();
    const boundary = editor.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const left = clamp(rect.left, boundary.left + 8, boundary.right - 264);
    const showAbove = rect.bottom + 230 > boundary.bottom && rect.top - 230 >= boundary.top;
    const top = clamp(showAbove ? rect.top - 230 : rect.bottom + 6, boundary.top + 8, boundary.bottom - 232);
    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();
    const selectRole = (role: SeedanceImageRole) => {
        if (selectedRef.current || disabledReason(role)) return;
        selectedRef.current = true;
        onSelect(role);
    };

    return createPortal(
        <div data-canvas-resource-mention-menu="true" className="fixed z-[120] w-64 rounded-xl border p-1 shadow-2xl backdrop-blur-md" style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onClick={(event) => event.stopPropagation()}>
            <div className="px-2 py-1 text-[11px] opacity-55">@{reference.label} 用作</div>
            {CANVAS_SEEDANCE_IMAGE_ROLES.map((role, index) => {
                const reason = disabledReason(role.value);
                return (
                    <button key={role.value} type="button" disabled={Boolean(reason)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40" style={{ background: !reason && index === activeIndex ? theme.toolbar.activeBg : "transparent", color: !reason && index === activeIndex ? theme.toolbar.activeText : theme.node.text }} title={reason} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); selectRole(role.value); }}>
                        <span className="block font-medium">{role.label}</span>
                        <span className="block opacity-60">{reason || role.description}</span>
                    </button>
                );
            })}
        </div>,
        document.body,
    );
}

function MentionMenu({ editor, references, activeIndex, theme, disabledReason, onSelect }: { editor: HTMLDivElement; references: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabledReason: (reference: CanvasResourceReference) => string; onSelect: (reference: CanvasResourceReference) => void }) {
    const selectedRef = useRef(false);
    const rect = editor.getBoundingClientRect();
    const boundary = editor.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);
    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current || disabledReason(reference)) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div data-canvas-resource-mention-menu="true" className="fixed z-[120] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md" style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onClick={(event) => event.stopPropagation()}>
            {references.map((reference, index) => {
                const reason = disabledReason(reference);
                return <button
                    key={reference.id}
                    type="button"
                    disabled={Boolean(reason)}
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: !reason && index === activeIndex ? theme.toolbar.activeBg : "transparent", color: !reason && index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    title={reason}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1"><span className="block font-medium">@{reference.label}</span><span className="block truncate opacity-65">{reason || reference.text || reference.title}</span></span>
                </button>
            })}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10"><Icon className="size-4" /></span>;
}

function renderEditorValue(editor: HTMLElement, value: string, referenceByNodeId: Map<string, CanvasResourceReference>, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    editor.textContent = "";
    const labels = canvasResourceMentionLabels(value, Array.from(referenceByNodeId.values()).map((reference) => ({ nodeId: reference.nodeId, kind: reference.kind })));
    let lastIndex = 0;
    for (const match of value.matchAll(CANVAS_RESOURCE_MENTION_TOKEN_PATTERN)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) editor.append(document.createTextNode(value.slice(lastIndex, match.index)));
        const reference = referenceByNodeId.get(match[1]);
        editor.append(reference ? createReferenceChip(reference, theme, match[2] as SeedanceImageRole | undefined, labels.get(reference.nodeId) || reference.label) : document.createTextNode(match[0]));
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) editor.append(document.createTextNode(value.slice(lastIndex)));
}

function createReferenceChip(reference: CanvasResourceReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes], role: SeedanceImageRole | undefined, label: string) {
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.dataset.referenceNodeId = reference.nodeId;
    chip.dataset.referenceKind = reference.kind;
    if (role) chip.dataset.referenceRole = role;
    chip.className = "mx-0.5 inline-flex h-6 max-w-40 items-center rounded-md border px-1.5 text-xs font-medium leading-none align-middle";
    const roleLabel = canvasResourceMentionRoleLabel(role);
    chip.textContent = `@${label}${roleLabel ? ` · ${roleLabel}` : ""}`;
    chip.title = reference.text || reference.title;
    Object.assign(chip.style, { background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.toolbar.activeText });
    return chip;
}

function refreshReferenceChipLabels(editor: HTMLElement, referenceByNodeId: Map<string, CanvasResourceReference>) {
    const labels = new Map<string, string>();
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    editor.querySelectorAll<HTMLElement>("[data-reference-node-id]").forEach((chip) => {
        const nodeId = chip.dataset.referenceNodeId || "";
        const reference = referenceByNodeId.get(nodeId);
        if (!reference) return;
        let label = labels.get(nodeId);
        if (!label) {
            const index = counts[reference.kind]++;
            label = reference.kind === "image" ? `图片${index + 1}` : reference.kind === "video" ? `视频${index + 1}` : reference.kind === "audio" ? `音频${index + 1}` : `文本${index + 1}`;
            labels.set(nodeId, label);
        }
        const roleLabel = canvasResourceMentionRoleLabel(chip.dataset.referenceRole as SeedanceImageRole | undefined);
        chip.textContent = `@${label}${roleLabel ? ` · ${roleLabel}` : ""}`;
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
        else if (node.tagName === "DIV" || node.tagName === "P") result += `${result ? "\n" : ""}${serializeNodes(node.childNodes)}`;
        else result += serializeNodes(node.childNodes);
    });
    return result;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const source = selection.getRangeAt(0);
    const editor = closestEditor(source.startContainer);
    if (!editor) return "";
    const range = source.cloneRange();
    range.selectNodeContents(editor);
    range.setEnd(source.startContainer, source.startOffset);
    return range.toString();
}

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = textBeforeCaret();
    const mention = readCanvasReferenceMention(text, text.length);
    if (!mention || range.startContainer.nodeType !== Node.TEXT_NODE) return;
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

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
