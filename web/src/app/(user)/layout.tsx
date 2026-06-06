"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { cn } from "@/lib/utils";

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const immersiveCanvas = /^\/canvas\/[^/]+/.test(pathname);

    return (
        <div className="h-dvh overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className={cn("h-full min-h-0 overflow-hidden", !immersiveCanvas && "pb-14 pt-14 lg:pb-0 lg:pl-20 lg:pt-0")}>{children}</div>
        </div>
    );
}
