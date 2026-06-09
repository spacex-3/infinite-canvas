import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

const AUTH_TOKEN_KEY = "infinite-canvas-auth-token-v1";

function proxyHeaders(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");
    headers.delete("expect");
    headers.set("x-forwarded-host", request.nextUrl.host);
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
    return headers;
}

function responseHeaders(response: Response) {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    return headers;
}

async function applyAuthCookie(request: NextRequest, response: Response, headers: Headers, path: string[]) {
    const isAuthSessionRequest = request.method === "POST" && path.join("/") === "auth/login";
    const isRegisterSessionRequest = request.method === "POST" && path.join("/") === "auth/register";
    if (!isAuthSessionRequest && !isRegisterSessionRequest) return;
    if (response.status < 200 || response.status >= 300) return;

    try {
        const payload = (await response.clone().json()) as { code?: number; data?: { token?: unknown } };
        const token = typeof payload.data?.token === "string" ? payload.data.token : "";
        if (payload.code !== 0 || !token) return;
        const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
        headers.set("Set-Cookie", `${AUTH_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=604800; SameSite=Lax${secure}`);
    } catch {
        // Leave the proxied response untouched if the backend payload is not an auth session envelope.
    }
}

async function proxy(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8080";
    const target = `${apiBaseUrl.replace(/\/$/, "")}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    try {
        const response = await fetch(target, {
            method: request.method,
            headers: proxyHeaders(request),
            body: hasBody ? request.body : undefined,
            duplex: hasBody ? "half" : undefined,
            redirect: "manual",
        } as RequestInit & { duplex?: "half" });

        const headers = responseHeaders(response);
        await applyAuthCookie(request, response, headers, path);

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch (error) {
        console.error("Failed to proxy", target, error);
        return Response.json({ code: 1, data: null, msg: "接口连接失败，请确认后端服务已启动" }, { status: 502 });
    }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
