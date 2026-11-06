import { FileText, Home, Images, Maximize2 } from "lucide-react";

export const navigationTools = [
    {
        slug: "",
        label: "首页",
        shortLabel: "首页",
        icon: Home,
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
