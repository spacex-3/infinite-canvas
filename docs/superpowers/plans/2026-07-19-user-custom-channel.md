# User Custom Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-controlled browser-local channel for ordinary users and rename the visible ZeroFall protocol label to zpika.

**Architecture:** Preserve the existing public feature flag and persisted Zustand configuration. Centralize custom-channel authorization in a pure helper, then reuse the existing direct request and model-fetching paths from the configuration modal.

**Tech Stack:** Go, React, TypeScript, Next.js App Router, Zustand, Ant Design, Bun tests.

## Global Constraints

- Keep the stored protocol value `zerofall`; change display copy only.
- Store user Base URL, API Key, protocol, and model selections in browser-local Zustand persistence.
- Do not add user credential storage to the backend.
- Do not expose image resolution routing in the user custom-channel form.

---

### Task 1: Preserve The Public Feature Flag

**Files:**
- Modify: `service/settings.go`
- Modify: `service/settings_test.go`

- [ ] Write a failing normalization test for `allowCustomChannel=true`.
- [ ] Run the focused Go test and confirm the forced-false behavior fails it.
- [ ] Preserve a submitted value and default a missing value to false.
- [ ] Re-run the focused Go test.

### Task 2: Authorize And Persist User Custom Channels

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/stores/use-config-store.test.ts`

- [ ] Write failing tests for admin, ordinary user, and anonymous access decisions plus protocol persistence.
- [ ] Run the focused Bun test and confirm failure.
- [ ] Add the `protocol` config field and centralized access helper; use it in effective-config resolution.
- [ ] Re-run the focused Bun test.

### Task 3: Build The Admin And User Configuration UI

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Modify: `web/src/components/layout/client-root-init.tsx`
- Test: `web/src/components/layout/app-config-modal.test.ts`

- [ ] Write source-level failing assertions for the public switch, zpika label, user protocol field, tag model input, and permission-aware URL import.
- [ ] Run the focused Bun test and confirm failure.
- [ ] Add the admin switch and preserve it during frontend normalization.
- [ ] Expose custom-channel mode to eligible users, merge fetched/manual models, and update permission copy.
- [ ] Apply the same permission helper to URL imports.
- [ ] Re-run the focused Bun test.

### Task 4: Route Browser-Local Protocol Requests

**Files:**
- Modify: `web/src/services/api/image.ts`
- Modify: `web/src/services/api/video.ts`
- Modify: `web/src/services/api/image.test.ts`
- Modify: `web/src/services/api/video.test.ts`

- [ ] Write failing tests for local zpika/fpbrowser2api aliases and cloud-mode isolation.
- [ ] Run the focused Bun tests and confirm the request-protocol helpers are missing.
- [ ] Route local zpika video requests to `/video/generations` and local fpbrowser2api image/video requests to `/videos`.
- [ ] Re-run the focused Bun tests.

### Task 5: Update Release And Project Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/backend/system-settings.mdx`
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: `docs/content/docs/overview/features.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Check: `docs/content/docs/progress/todo.mdx`

- [ ] Document the feature flag, browser-local key behavior, model fetching, and zpika display name.
- [ ] Replace obsolete pending-test statements that ordinary users can only use cloud channels.
- [ ] Confirm no todo item needs to move.

### Task 6: Verify And Push

**Files:** all modified files

- [ ] Run the focused Go and Bun tests required by the TDD cycles.
- [ ] Review the diff for unrelated changes and credential leakage.
- [ ] Commit on `feat/zerofall-omni-flash-video-api`.
- [ ] Push to `origin/feat/zerofall-omni-flash-video-api` and verify the remote SHA.
