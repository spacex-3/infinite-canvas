"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { canUseCustomChannel, ZPIKA_GROUP_IDS, useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const pathname = usePathname();
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const user = useUserStore((state) => state.user);
    const isUserReady = useUserStore((state) => state.isReady);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const customChannels = useConfigStore((state) => state.config.customChannels);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isLoginPage = pathname === "/login" || pathname === "/admin/login";

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!isLoginPage) void hydrateUser();
    }, [hydrateUser, isLoginPage]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        if (!isUserReady || !publicSettings) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        const allowCustomChannel = publicSettings.modelChannel.allowCustomChannel === true;
        if (!canUseCustomChannel(user?.role, allowCustomChannel)) {
            openConfigDialog(false);
            message.error("管理员未开放自定义渠道");
            return;
        }
        updateConfig("channelMode", "local");
        // Domains are locked to zpika; URL imports only inject the API key into the text group (and any still-empty groups as fallback).
        if (apiKey) {
            updateConfig(
                "customChannels",
                customChannels.map((channel) => {
                    if (channel.id === ZPIKA_GROUP_IDS.text) return { ...channel, apiKey };
                    if (!channel.apiKey.trim()) return { ...channel, apiKey };
                    return channel;
                }),
            );
        }
        if (baseUrl) {
            message.info("已锁定 Zpika 域名，忽略 URL 中的 Base URL，仅导入 API Key");
        }
        openConfigDialog(false);
    }, [customChannels, isUserReady, message, openConfigDialog, publicSettings, updateConfig, user?.role]);

    return <>{children}</>;
}
