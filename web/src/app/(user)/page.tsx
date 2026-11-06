"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Maximize2, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";

export default function IndexPage() {
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);

    useEffect(() => {
        void fetchPrompts({ pageSize: 6 })
            .then((data) => setPromptShowcase(data.items))
            .catch(() => setPromptShowcase([]));
    }, []);

    return (
        <main className="h-full overflow-y-auto overflow-x-hidden bg-[#f5f6f8] text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
                <section className="flex min-h-[52vh] flex-col justify-center border-b border-stone-200 py-12 dark:border-stone-800">
                    <div className="flex items-center gap-3 text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
                        <span className="inline-flex size-8 items-center justify-center rounded-md bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                            <WandSparkles className="size-4" />
                        </span>
                        <span>朋克 · 个人 AI 工作台</span>
                    </div>

                    <h1 className="mt-8 text-5xl font-semibold leading-none tracking-normal text-stone-950 dark:text-stone-100">朋克</h1>
                    <div className="mt-5 max-w-3xl text-2xl font-semibold leading-9 text-stone-700 sm:text-3xl dark:text-stone-300">AI 时代的个人想法实现工作台</div>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600 dark:text-stone-400">把脑海里的想法放进一张无限画布，组织文字、图片、视频与素材，让一句灵感逐步成为看得见的作品。</p>

                    <div className="mt-9">
                        <Link href="/canvas" className="inline-flex h-12 items-center gap-3 rounded-lg bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white">
                            <Maximize2 className="size-4" />
                            进入画布
                            <ArrowRight className="size-4" />
                        </Link>
                    </div>
                </section>

                <section className="py-10 sm:py-12">
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <div className="text-xs font-semibold uppercase text-stone-400 dark:text-stone-500">Reusable ideas</div>
                            <h2 className="mt-2 text-2xl font-semibold tracking-normal">可复用灵感</h2>
                        </div>
                        <Link href="/prompts" className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100">
                            查看全部
                            <ArrowUpRight className="size-4" />
                        </Link>
                    </div>

                    <div className="mt-6 border-t border-stone-200 dark:border-stone-800">
                        {promptShowcase.slice(0, 4).map((item, index) => (
                            <Link key={item.id} href="/prompts" className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-stone-200 py-5 transition hover:bg-white/70 sm:grid-cols-[2rem_4rem_minmax(0,1fr)_auto] sm:px-3 dark:border-stone-800 dark:hover:bg-stone-900/70">
                                <span className="text-xs font-semibold text-stone-400 dark:text-stone-600">{String(index + 1).padStart(2, "0")}</span>
                                {item.coverUrl ? <img src={item.coverUrl} alt="" className="hidden size-16 rounded-md object-cover sm:block" /> : <span className="hidden size-16 items-center justify-center rounded-md bg-stone-200 text-stone-500 sm:flex dark:bg-stone-800 dark:text-stone-400"><WandSparkles className="size-5" /></span>}
                                <span className="min-w-0">
                                    <span className="block truncate text-base font-semibold text-stone-900 dark:text-stone-100">{item.title}</span>
                                    <span className="mt-1 line-clamp-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{item.prompt}</span>
                                </span>
                                <ArrowUpRight className="size-4 text-stone-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-stone-950 dark:group-hover:text-stone-100" />
                            </Link>
                        ))}
                        {!promptShowcase.length ? <div className="border-b border-stone-200 py-8 text-sm text-stone-400 dark:border-stone-800">暂无可复用灵感</div> : null}
                    </div>
                </section>
            </div>
        </main>
    );
}
