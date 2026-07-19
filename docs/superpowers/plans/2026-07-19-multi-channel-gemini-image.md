# Multi-Channel Gemini Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add capability-specific multi-channel routing, Gemini native image support, and `1080p`/`10s`/`9:16` video defaults.

**Architecture:** Keep cloud model-based channel selection and add Gemini translation in the Go proxy. Store browser-local channels as independent records with stable IDs and resolve a channel from the requested capability and real model before each direct request. Keep image and video aspect ratios in separate config fields.

**Tech Stack:** Go, Gin, GORM, Next.js App Router, React, TypeScript, Ant Design, Zustand, Axios, Bun test.

## Global Constraints

- User API keys remain browser-local and direct requests do not consume Canvas credits.
- Cloud API keys remain backend-only.
- Model fetching never selects models automatically.
- Do not execute a production build.
- Preserve unrelated untracked API documentation files.

---

### Task 1: Configuration model and video defaults

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Test: `web/src/stores/use-config-store.test.ts`

**Interfaces:**
- Produces: `CustomAiChannel`, `resolveCustomChannelConfig(config, capability, model)`, `videoSize` and per-capability channel IDs.

- [ ] Write tests asserting `1080p`, `10s`, `9:16`, normalized custom channel records, and capability-specific channel resolution.
- [ ] Run `bun test src/stores/use-config-store.test.ts` and confirm the new assertions fail for missing fields and resolver.
- [ ] Implement the new types, defaults, persisted normalization, local effective model lists, and resolver.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Multi-channel user configuration UI

**Files:**
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Test: `web/src/components/layout/app-config-modal.test.ts`

**Interfaces:**
- Consumes: `CustomAiChannel` and the store update action.
- Produces: channel CRUD, per-channel model classification, and four channel/model default bindings.

- [ ] Add source-level UI assertions for channel selection, add/delete commands, Gemini protocol, and binding selectors.
- [ ] Run the focused modal test and confirm it fails.
- [ ] Replace the single local channel fields with a selected-channel editor and capability binding selects.
- [ ] Re-run the focused modal test and confirm it passes.

### Task 3: Separate video aspect ratio

**Files:**
- Modify: `web/src/services/api/video.ts`
- Modify: `web/src/components/video-settings-panel.tsx`
- Modify: `web/src/app/(user)/video/page.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-settings-popover.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- Test: `web/src/services/api/video.test.ts`

**Interfaces:**
- Consumes: `AiConfig.videoSize`.
- Produces: video payloads and UI settings that no longer read image `size` as their default.

- [ ] Add video payload tests proving the default config produces `1080p`, `10s`, and `9:16`.
- [ ] Run the focused video test and confirm it fails while video code still reads `size`.
- [ ] Update video request builders, panels, logs and canvas generation config to use `videoSize`.
- [ ] Re-run the focused video test and confirm it passes.

### Task 4: Local Gemini image protocol

**Files:**
- Create: `web/src/services/api/gemini-image.ts`
- Modify: `web/src/services/api/image.ts`
- Modify: `web/src/services/api/image.test.ts`

**Interfaces:**
- Produces: `buildGeminiApiUrl`, `buildGeminiImagePayload`, `parseGeminiImagePayload`, and local Gemini model fetching.

- [ ] Add tests with the documented `generateContent` request and both `inlineData`/`fileData` response forms.
- [ ] Run the focused image test and confirm missing helper failures.
- [ ] Implement payload conversion, reference image conversion, response parsing, and model list parsing.
- [ ] Route local image generation/edit/model-fetch requests through the Gemini helper.
- [ ] Re-run focused image tests and confirm they pass.

### Task 5: Cloud Gemini proxy

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Create: `handler/gemini_image.go`
- Modify: `handler/ai_task.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Test: `handler/ai_test.go`
- Test: `service/settings_test.go`
- Test: `web/src/app/(admin)/admin/settings/page.test.ts`

**Interfaces:**
- Produces: backend `gemini` protocol normalization, `/v1beta/models` fetching, OpenAI-to-Gemini image request conversion, and admin protocol selection.

- [ ] Add Go and frontend source tests for Gemini protocol normalization, URL building, model parsing and multipart/JSON request conversion.
- [ ] Confirm frontend assertions fail; record that Go tests cannot run if `go` is unavailable.
- [ ] Implement backend Gemini URL/model/request conversion and add the admin protocol option.
- [ ] Re-run available focused tests.

### Task 6: Documentation, regression verification, and delivery

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Check: `docs/content/docs/progress/todo.mdx`

**Interfaces:**
- Produces: deployment-ready branch and test checklist.

- [ ] Record browser verification items for multi-channel bindings, Gemini generation/edit and new video defaults.
- [ ] Run the complete Bun test suite without running a build.
- [ ] Review the diff, scan for secrets, and verify unrelated untracked files are excluded.
- [ ] Commit the scoped files, push `feat/zerofall-omni-flash-video-api`, and verify the remote SHA.
