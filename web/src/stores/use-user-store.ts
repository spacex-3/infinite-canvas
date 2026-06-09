"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_TOKEN_KEY, fetchCurrentUser, login, register, type AuthPayload, type AuthUser } from "@/services/api/auth";

type UserStore = {
    token: string;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    setSession: (token: string, user: AuthUser) => void;
    clearSession: () => void;
    hydrateUser: () => Promise<void>;
    login: (payload: AuthPayload) => Promise<AuthUser>;
    register: (payload: AuthPayload) => Promise<AuthUser>;
};

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            token: "",
            user: null,
            isReady: false,
            isLoading: false,
            setSession: (token, user) => {
                writeAuthTokenSnapshot(token);
                set({ token, user, isReady: true });
            },
            clearSession: () => {
                clearAuthTokenSnapshot();
                set({ token: "", user: null, isReady: true });
            },
            hydrateUser: async () => {
                const token = readAuthTokenCookie() || get().token || readAuthTokenSnapshot();
                if (!token) {
                    set({ token: "", user: null, isReady: true, isLoading: false });
                    return;
                }
                set({ token, isLoading: true });
                try {
                    const user = await fetchCurrentUser(token);
                    if (user.role === "guest") {
                        clearAuthTokenSnapshot();
                        set({ token: "", user: null, isReady: true, isLoading: false });
                        return;
                    }
                    set({ token, user, isReady: true, isLoading: false });
                } catch {
                    clearAuthTokenSnapshot();
                    set({ token: "", user: null, isReady: true, isLoading: false });
                }
            },
            login: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await login(payload);
                    writeAuthTokenSnapshot(session.token);
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
            register: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await register(payload);
                    writeAuthTokenSnapshot(session.token);
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
        }),
        {
            name: AUTH_TOKEN_KEY,
            partialize: (state) => ({ token: state.token }),
        },
    ),
);

function writeAuthTokenSnapshot(token: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ state: { token }, version: 0 }));
    } catch {
        // Zustand persist still writes through its configured storage; this is
        // only a synchronous fallback for browsers that refresh immediately.
    }
    writeAuthTokenCookie(token);
}

function clearAuthTokenSnapshot() {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
        // Zustand persist will still clear through its normal write path.
    }
    clearAuthTokenCookie();
}

function readAuthTokenSnapshot() {
    if (typeof window === "undefined") return "";
    try {
        const raw = window.localStorage.getItem(AUTH_TOKEN_KEY);
        if (raw) {
            const snapshot = JSON.parse(raw) as { state?: { token?: unknown } };
            if (typeof snapshot.state?.token === "string" && snapshot.state.token) {
                return snapshot.state.token;
            }
        }
    } catch {
        return "";
    }
    return "";
}

function writeAuthTokenCookie(token: string) {
    try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${AUTH_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
    } catch {
        // Local storage remains the primary persistence mechanism.
    }
}

function clearAuthTokenCookie() {
    try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${AUTH_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    } catch {
        // Nothing else to clear.
    }
}

function readAuthTokenCookie() {
    try {
        const prefix = `${AUTH_TOKEN_KEY}=`;
        const match = document.cookie
            .split(";")
            .map((item) => item.trim())
            .find((item) => item.startsWith(prefix));
        return match ? decodeURIComponent(match.slice(prefix.length)) : "";
    } catch {
        return "";
    }
}
