"use client";

import { ArrowRight, FileText, ImagePlus, Images, Layers3, Maximize2, PackageOpen, Sparkles, Video, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Tag } from "antd";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { buildPromptHref } from "@/lib/workspace-route";
import { cn } from "@/lib/utils";

const modes = [
    { key: "image", label: "图片生成", description: "商品主图、详情图、场景图", href: "/image", icon: ImagePlus },
    { key: "video", label: "视频生成", description: "卖点短片、投放素材、口播脚本", href: "/video", icon: Video },
    { key: "canvas", label: "画布整理", description: "拆解卖点、串联素材、沉淀方案", href: "/canvas", icon: Maximize2 },
] as const;

const skills = [
    { title: "商品图精修", description: "优化质感、光影和细节", href: "/image", icon: Sparkles, tone: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200" },
    { title: "主图生成", description: "按商品卖点生成电商主图", href: "/image", icon: ImagePlus, tone: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200" },
    { title: "卖点短视频", description: "生成适合投放的视频素材", href: "/video", icon: Video, tone: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200" },
    { title: "爆款裂变", description: "围绕同一卖点扩展多版素材", href: "/canvas", icon: Layers3, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200" },
    { title: "提示词库", description: "复用稳定的电商提示词", href: "/prompts", icon: FileText, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200" },
    { title: "素材归档", description: "沉淀商品图、视频和文本资产", href: "/assets", icon: Images, tone: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-100" },
] as const;

const quickPrompts = ["生成一组高端护肤品主图，白底，柔和自然光", "把参考图里的商品做成适合小红书投放的场景图", "为一款便携咖啡机生成 8 秒卖点短视频脚本"];

export default function IndexPage() {
    const router = useRouter();
    const [activeModeKey, setActiveModeKey] = useState<(typeof modes)[number]["key"]>("image");
    const [prompt, setPrompt] = useState("");
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const activeMode = useMemo(() => modes.find((mode) => mode.key === activeModeKey) || modes[0], [activeModeKey]);

    useEffect(() => {
        void fetchPrompts({ pageSize: 6 })
            .then((data) => setPromptShowcase(data.items))
            .catch(() => setPromptShowcase([]));
    }, []);

    const submit = (targetHref = activeMode.href) => {
        router.push(buildPromptHref(targetHref, prompt));
    };

    return (
        <main className="h-full overflow-y-auto overflow-x-hidden bg-[#f5f6f8] text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <section className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                    <div className="min-w-0">
                        <div className="mb-8 flex flex-wrap items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                            <Tag className="m-0 rounded-md border-stone-300 bg-white/80 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">朋克</Tag>
                            <span>电商图片、视频与素材创作工作台</span>
                        </div>

                        <div className="max-w-4xl">
                            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-normal text-stone-950 sm:text-6xl dark:text-stone-100">
                                <span className="block sm:inline">朋克，</span>
                                <span className="block sm:inline">为电商而生</span>
                            </h1>
                            <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 dark:text-stone-400">把商品、卖点、参考图和风格要求放进同一个入口，快速进入图片生成、视频创作或画布整理流程。</p>
                        </div>

                        <div className="mt-8 min-w-0 max-w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-[0_18px_60px_rgba(28,25,23,0.08)] dark:border-stone-800 dark:bg-stone-900">
                            <div className="grid gap-2 border-b border-stone-100 p-3 sm:grid-cols-3 dark:border-stone-800">
                                {modes.map((mode) => {
                                    const Icon = mode.icon;
                                    const active = mode.key === activeModeKey;
                                    return (
                                        <button
                                            key={mode.key}
                                            type="button"
                                            onClick={() => setActiveModeKey(mode.key)}
                                            className={cn(
                                                "flex min-w-0 items-start gap-3 rounded-md border px-3 py-3 text-left transition",
                                                active ? "border-stone-900 bg-stone-950 dark:border-stone-200 dark:bg-stone-100" : "border-transparent bg-stone-50 text-stone-600 hover:border-stone-200 hover:text-stone-950 dark:bg-stone-950 dark:text-stone-300 dark:hover:border-stone-700 dark:hover:text-white",
                                            )}
                                        >
                                            <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-white dark:text-stone-950" : "text-stone-700 dark:text-stone-300")} />
                                            <span className="min-w-0">
                                                <span className={cn("block text-sm font-semibold", active ? "text-white dark:text-stone-950" : "text-stone-900 dark:text-stone-100")}>{mode.label}</span>
                                                <span className={cn("mt-1 block truncate text-xs", active ? "text-white/70 dark:text-stone-600" : "text-stone-400 dark:text-stone-500")}>{mode.description}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="p-4 sm:p-5">
                                <Input.TextArea
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    autoSize={{ minRows: 4, maxRows: 7 }}
                                    placeholder="输入商品、卖点、参考风格或想生成的素材，例如：为一款女士通勤包生成 4 张高级感主图，突出大容量和轻量材质。"
                                    className="!border-0 !bg-transparent !px-0 !py-0 text-base !shadow-none"
                                />
                                <div className="mt-5 flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
                                    <div className="flex flex-wrap gap-2">
                                        {quickPrompts.map((item) => (
                                            <button key={item} type="button" onClick={() => setPrompt(item)} className="min-w-0 max-w-full truncate rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-500 transition hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-100">
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                    <Button type="primary" size="large" icon={<ArrowRight className="size-4" />} iconPlacement="end" onClick={() => submit()}>
                                        进入{activeMode.label}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {skills.map((skill) => {
                                const Icon = skill.icon;
                                return (
                                    <button key={skill.title} type="button" onClick={() => submit(skill.href)} className="group flex min-w-0 items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_14px_34px_rgba(28,25,23,0.08)] dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700">
                                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", skill.tone)}>
                                            <Icon className="size-5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1 text-sm font-semibold text-stone-950 dark:text-stone-100">
                                                {skill.title}
                                                <ArrowRight className="size-3 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                                            </span>
                                            <span className="mt-1 block truncate text-xs text-stone-500 dark:text-stone-400">{skill.description}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <aside className="grid gap-4 lg:pt-20">
                        <div className="rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                                <PackageOpen className="size-4 text-stone-500" />
                                今日工作流
                            </div>
                            <div className="mt-5 grid gap-3">
                                {[
                                    ["商品输入", "上传商品图或描述卖点"],
                                    ["创意生成", "生成图片、视频或提示词方案"],
                                    ["画布沉淀", "把好结果连成可复用流程"],
                                ].map(([title, text], index) => (
                                    <div key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                                        <div className="flex size-7 items-center justify-center rounded-md bg-stone-100 text-xs font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-300">{index + 1}</div>
                                        <div>
                                            <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{title}</div>
                                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{text}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                                <WandSparkles className="size-4 text-stone-500" />
                                可复用灵感
                            </div>
                            <div className="mt-4 grid gap-3">
                                {promptShowcase.slice(0, 3).map((item) => (
                                    <button key={item.id} type="button" onClick={() => router.push("/prompts")} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-md border border-stone-100 p-2 text-left transition hover:border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:border-stone-700 dark:hover:bg-stone-950">
                                        <img src={item.coverUrl} alt={item.title} className="h-16 w-16 rounded-md object-cover" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">{item.title}</span>
                                            <span className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{item.prompt}</span>
                                        </span>
                                    </button>
                                ))}
                                {!promptShowcase.length ? <div className="rounded-md border border-dashed border-stone-200 p-4 text-sm text-stone-400 dark:border-stone-800">暂无提示词素材</div> : null}
                            </div>
                        </div>
                    </aside>
                </div>
            </section>
        </main>
    );
}
