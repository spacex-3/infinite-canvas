"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { canonicalizeCanvasResourceMentionText, renderCanvasResourceMentionText } from "../utils/canvas-resource-mention-format";
import { matchesCanvasReferenceQuery, readCanvasReferenceMention, shouldResetCanvasReferenceSelection } from "../utils/canvas-resource-query";

type MentionState = {
    start: number;
    query: string;
};

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    containerClassName?: string;
};

export const CanvasResourceMentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function CanvasResourceMentionTextarea({ value, references, onChange, onKeyDown, className, containerClassName, style, ...props }, forwardedRef) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const activeReferences = useMemo(() => references.filter((item) => item.active), [references]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((item) => matchesCanvasReferenceQuery([item.label, item.title, item.kind, item.text || ""], query));
    }, [activeReferences, mention]);
    const displayValue = useMemo(() => renderCanvasResourceMentionText(value, activeReferences), [activeReferences, value]);
    const toCanonicalValue = (nextValue: string) => canonicalizeCanvasResourceMentionText(nextValue, activeReferences);

    const updateValue = (next: string, selectionStart?: number) => {
        onChange(toCanonicalValue(next));
        if (typeof selectionStart !== "number") return;
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(selectionStart, selectionStart);
        });
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const syncMention = (nextValue: string, cursor: number) => {
        const nextMention = readCanvasReferenceMention(nextValue, cursor);
        if (!nextMention || !references.some((item) => item.active)) {
            closeMention();
            return;
        }
        if (shouldResetCanvasReferenceSelection(mention, nextMention)) setActiveIndex(0);
        setMention(nextMention);
    };

    const syncCurrentMention = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        syncMention(textarea.value, textarea.selectionStart);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        if (!mention) return;
        const textarea = textareaRef.current;
        const end = textarea?.selectionStart ?? displayValue.length;
        const insertText = `${reference.label} `;
        const next = `${displayValue.slice(0, mention.start)}${insertText}${displayValue.slice(end)}`;
        closeMention();
        updateValue(next, mention.start + insertText.length);
    };

    const textColor = style?.color || theme.node.text;
    const mergedStyle = {
        ...(style || {}),
        color: textColor,
        caretColor: textColor,
    } as CSSProperties;
    const menu = mention && candidates.length && textareaRef.current ? <MentionMenu textarea={textareaRef.current} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} /> : null;

    return (
        <div className={`relative h-full w-full ${containerClassName || ""}`}>
            <textarea
                {...props}
                ref={(node) => {
                    textareaRef.current = node;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                value={displayValue}
                className={className}
                style={mergedStyle}
                onChange={(event) => {
                    const next = event.target.value;
                    onChange(toCanonicalValue(next));
                    syncMention(next, event.target.selectionStart);
                }}
                onKeyDown={(event) => {
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
                            insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                            return;
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            closeMention();
                            return;
                        }
                    }
                    onKeyDown?.(event);
                }}
                onKeyUp={syncCurrentMention}
                onClick={syncCurrentMention}
                onFocus={syncCurrentMention}
                onSelect={syncCurrentMention}
                onBlur={(event) => {
                    window.setTimeout(closeMention, 120);
                    props.onBlur?.(event);
                }}
            />
            {menu}
        </div>
    );
});

function MentionMenu({ textarea, references, activeIndex, theme, onSelect }: { textarea: HTMLTextAreaElement; references: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasResourceReference) => void }) {
    const selectedRef = useRef(false);
    const rect = textarea.getBoundingClientRect();
    const boundary = textarea.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => {
        event.stopPropagation();
    };
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            className="fixed z-[120] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
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
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
