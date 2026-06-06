import { FileText, Home, ImagePlus, Images, Maximize2, Video } from "lucide-react";

export const navigationTools = [
    {
        slug: "",
        label: "首页",
        shortLabel: "首页",
        icon: Home,
    },
    {
        slug: "image",
        label: "AI 图片",
        shortLabel: "图片",
        icon: ImagePlus,
    },
    {
        slug: "video",
        label: "AI 视频",
        shortLabel: "视频",
        icon: Video,
    },
    {
        slug: "canvas",
        label: "画布",
        shortLabel: "画布",
        icon: Maximize2,
    },
    {
        slug: "prompts",
        label: "提示词",
        shortLabel: "提示词",
        icon: FileText,
    },
    {
        slug: "assets",
        label: "素材",
        shortLabel: "素材",
        icon: Images,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
