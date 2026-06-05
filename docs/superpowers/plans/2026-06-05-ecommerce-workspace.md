# Ecommerce Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Infinite Canvas user UI into an ecommerce AIGC workspace with a side/bottom nav shell, smart home prompt handoff, and ecommerce-focused Chinese copy.

**Architecture:** Keep existing feature pages and APIs. Replace the user shell navigation and home page, then add small URL prompt hydration behavior to `/image` and `/video`. Do not add backend tables, stores, or new AI providers.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, lucide-react, Zustand.

---

## File Structure

- Modify `web/src/constant/navigation-tools.ts`: ecommerce workspace labels, home-aware navigation metadata.
- Modify `web/src/components/layout/app-top-nav.tsx`: convert top navigation into responsive workspace navigation.
- Modify `web/src/app/(user)/layout.tsx`: make user layout compatible with left rail and mobile bottom navigation.
- Modify `web/src/app/(user)/page.tsx`: replace landing page with ecommerce input hub and skill cards.
- Modify `web/src/app/(user)/image/page.tsx`: hydrate prompt from `?prompt=`.
- Modify `web/src/app/(user)/video/page.tsx`: hydrate prompt from `?prompt=`.
- Modify `docs/content/docs/progress/pending-test.mdx`: record the testable workspace changes.
- Check `docs/content/docs/progress/todo.mdx`: only add follow-up items if implementation leaves a known product gap.

## Task 1: Navigation Metadata

**Files:**
- Modify: `web/src/constant/navigation-tools.ts`

- [ ] **Step 1: Update navigation labels and include home**

Use direct lucide imports and keep the exported `NavigationToolSlug` type derived from `navigationTools`.

```ts
import { FileText, Home, ImagePlus, Images, Maximize2, Video } from "lucide-react";

export const navigationTools = [
    { slug: "", label: "首页", shortLabel: "首页", icon: Home },
    { slug: "image", label: "AI 图片", shortLabel: "图片", icon: ImagePlus },
    { slug: "video", label: "AI 视频", shortLabel: "视频", icon: Video },
    { slug: "canvas", label: "画布", shortLabel: "画布", icon: Maximize2 },
    { slug: "prompts", label: "提示词", shortLabel: "提示词", icon: FileText },
    { slug: "assets", label: "素材", shortLabel: "素材", icon: Images },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
```

- [ ] **Step 2: Verify imports compile by reading consumers**

Run:

```bash
rg -n "navigationTools|NavigationToolSlug" web/src
```

Expected: usages are in layout/navigation components and do not assume every slug is non-empty.

## Task 2: Workspace Shell Navigation

**Files:**
- Modify: `web/src/components/layout/app-top-nav.tsx`
- Modify: `web/src/app/(user)/layout.tsx`

- [ ] **Step 1: Replace header with responsive shell navigation**

Implement `AppTopNav` as:

- Hidden on `/canvas/[id]`.
- Desktop `aside` fixed left, width `5rem`, vertical nav.
- Mobile `nav` fixed bottom, first five primary entries visible.
- Logo link to `/`.
- User actions at the bottom of desktop rail.
- Keep `AppConfigModal`.

Use `href={tool.slug ? `/${tool.slug}` : "/"}` and active logic where home is active only for `/`.

- [ ] **Step 2: Update user layout spacing**

Change layout from a top-header column to a shell with content offset:

```tsx
return (
    <div className="h-dvh overflow-hidden bg-background text-foreground">
        <AppTopNav />
        <div className="h-full min-h-0 overflow-hidden lg:pl-20">{children}</div>
    </div>
);
```

Keep the canvas detail page safe by relying on `AppTopNav` hiding itself for `/canvas/[id]`; if visual inspection shows a left offset on canvas detail, gate the `lg:pl-20` class by pathname inside `UserLayout`.

- [ ] **Step 3: Remove unused mobile drawer code from `AppTopNav`**

Do not delete `mobile-nav-drawer.tsx` unless TypeScript shows it has no imports and the repository pattern supports removal. It can remain unused to avoid broad cleanup.

## Task 3: Ecommerce Workspace Home

**Files:**
- Modify: `web/src/app/(user)/page.tsx`

- [ ] **Step 1: Replace prompt showcase landing page**

Build the page around these local constants:

```ts
const modes = [
    { key: "image", label: "图片生成", href: "/image", icon: ImagePlus },
    { key: "video", label: "视频生成", href: "/video", icon: Video },
    { key: "canvas", label: "画布整理", href: "/canvas", icon: Maximize2 },
] as const;

const skills = [
    { title: "商品图精修", description: "优化质感、光影和细节", href: "/image", icon: Sparkles },
    { title: "主图生成", description: "按商品卖点生成电商主图", href: "/image", icon: ImagePlus },
    { title: "卖点短视频", description: "生成适合投放的视频素材", href: "/video", icon: Video },
    { title: "爆款裂变", description: "围绕同一卖点扩展多版素材", href: "/canvas", icon: Layers3 },
    { title: "提示词库", description: "复用稳定的电商提示词", href: "/prompts", icon: FileText },
    { title: "素材归档", description: "沉淀商品图、视频和文本资产", href: "/assets", icon: Images },
] as const;
```

- [ ] **Step 2: Add smart handoff**

Use `useRouter`, `useState`, and `URLSearchParams`.

```ts
const submit = (targetHref = activeMode.href) => {
    const text = prompt.trim();
    const suffix = text ? `?${new URLSearchParams({ prompt: text }).toString()}` : "";
    router.push(`${targetHref}${suffix}`);
};
```

The main button uses the active mode. Skill cards call `submit(skill.href)` so typed text can follow the user into the selected workflow.

- [ ] **Step 3: Keep visual style restrained**

Use Tailwind and Ant Design controls already in the project. Avoid new global CSS. Keep cards flat, with small radius, subtle borders, and Chinese copy.

## Task 4: Prompt Query Hydration

**Files:**
- Modify: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/app/(user)/video/page.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

Both files already import React hooks. Add:

```ts
import { useSearchParams } from "next/navigation";
```

- [ ] **Step 2: Hydrate prompt once**

Add after prompt state declarations:

```ts
const searchParams = useSearchParams();

useEffect(() => {
    const initialPrompt = searchParams.get("prompt")?.trim();
    if (!initialPrompt) return;
    setPrompt((value) => value || initialPrompt);
    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}, [searchParams]);
```

This preserves user-entered text and removes the query parameter after the first hydration.

## Task 5: Documentation

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Check: `docs/content/docs/progress/todo.mdx`

- [ ] **Step 1: Add pending-test entry**

Add one concise bullet near the top:

```md
- 用户端首页改为电商 AIGC 工作台入口，桌面端使用左侧窄导航、移动端使用底部导航；首页输入需求后可按图片、视频或画布模式跳转，并把提示词回填到 `/image`、`/video` 工作台，需要验证导航高亮、移动端底栏、提示词回填和地址栏参数清理。
```

- [ ] **Step 2: Check todo**

If `/canvas?prompt=` remains only保留参数, add no todo unless implementation explicitly needs follow-up. The design already states canvas prompt consumption is non-goal for this pass.

## Task 6: Verification

**Files:**
- Read changed files and run lightweight commands only.

- [ ] **Step 1: Inspect diff**

Run:

```bash
git diff -- web/src/constant/navigation-tools.ts web/src/components/layout/app-top-nav.tsx 'web/src/app/(user)/layout.tsx' 'web/src/app/(user)/page.tsx' 'web/src/app/(user)/image/page.tsx' 'web/src/app/(user)/video/page.tsx' docs/content/docs/progress/pending-test.mdx docs/content/docs/progress/todo.mdx
```

Expected: only planned files changed.

- [ ] **Step 2: Start dev server for browser inspection**

Run:

```bash
cd web && bun run dev
```

Expected: Next dev server starts on port 3000 unless occupied.

- [ ] **Step 3: Browser checks**

Open:

```text
http://localhost:3000/
http://localhost:3000/image?prompt=测试商品主图
http://localhost:3000/video?prompt=测试卖点短视频
```

Expected:

- Home shows the ecommerce workspace.
- Desktop nav is left rail.
- Mobile viewport shows bottom nav.
- `/image` and `/video` fill prompt from URL and remove `prompt` from address.

No build is required because project instructions say the user will handle syntax/build checks.
