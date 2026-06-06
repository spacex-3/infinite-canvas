"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

export function AppTopNav() {
    const pathname = usePathname();
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = pathname === "/" ? "" : navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const mobileTools = navigationTools.filter((tool) => tool.slug !== "prompts");

    return (
        <>
            {!hideHeader ? (
                <>
                    <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 border-r border-stone-200 bg-white/88 backdrop-blur-xl lg:flex lg:flex-col dark:border-stone-800 dark:bg-stone-950/88">
                        <div className="flex justify-center pb-8 pt-6">
                            <Link href="/" className="flex size-9 items-center justify-center rounded-lg text-stone-950 transition hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-900" aria-label="返回首页">
                                <span
                                    className="size-6 shrink-0 bg-current"
                                    style={{
                                        mask: "url(/logo.svg) center / contain no-repeat",
                                        WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                    }}
                                />
                            </Link>
                        </div>

                        <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="工作台导航">
                            {navigationTools.map((tool) => (
                                <WorkspaceNavLink key={tool.slug || "home"} tool={tool} active={tool.slug === activeToolSlug} />
                            ))}
                        </nav>
                    </aside>

                    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-stone-200 bg-white/88 px-4 backdrop-blur-xl lg:hidden dark:border-stone-800 dark:bg-stone-950/88">
                        <Link href="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100">
                            <span
                                className="size-5 shrink-0 bg-current"
                                style={{
                                    mask: "url(/logo.svg) center / contain no-repeat",
                                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                }}
                            />
                            <span className="truncate">朋克</span>
                        </Link>
                        <div className="min-w-0 shrink-0 pl-3">
                            <UserStatusActions compact />
                        </div>
                    </header>

                    <div className="fixed right-4 top-4 z-40 hidden rounded-lg border border-stone-200 bg-white/88 px-2 py-1.5 backdrop-blur-xl lg:block dark:border-stone-800 dark:bg-stone-950/88">
                        <UserStatusActions />
                    </div>

                    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/92 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden dark:border-stone-800 dark:bg-stone-950/92 dark:shadow-[0_-10px_28px_rgba(0,0,0,0.28)]" aria-label="移动端工作台导航">
                        <div className="mx-auto grid h-14 w-full max-w-xl grid-cols-5">
                            {mobileTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                const href = tool.slug ? `/${tool.slug}` : "/";
                                return (
                                    <Link
                                        key={tool.slug || "home"}
                                        href={href}
                                        aria-current={active ? "page" : undefined}
                                        className={cn(
                                            "relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] font-medium transition after:absolute after:left-1/2 after:top-1 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full",
                                            active ? "text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100" : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                                        )}
                                    >
                                        <Icon className="size-5 shrink-0" />
                                        <span className="max-w-full truncate">{tool.shortLabel}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </nav>
                </>
            ) : null}

            <AppConfigModal />
        </>
    );
}

function WorkspaceNavLink({ tool, active }: { tool: (typeof navigationTools)[number]; active: boolean }) {
    const Icon = tool.icon;
    const href = tool.slug ? `/${tool.slug}` : "/";

    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
                "group relative flex h-[3.75rem] w-full flex-col items-center justify-center gap-1 rounded-lg border border-transparent px-1 text-center text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100",
                active && "border-stone-200 bg-stone-100 font-semibold text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100",
            )}
        >
            <Icon className="size-5" />
            <span className="max-w-full truncate text-[11px] leading-none">{tool.shortLabel}</span>
        </Link>
    );
}
