# User Custom Channel Design

## Goal

Allow an administrator to decide whether signed-in ordinary users may configure one browser-local AI channel with their own protocol, Base URL, API Key, and model list. Rename the visible `zerofall` protocol label to `zpika` without changing the stored protocol value or backend routing.

## Architecture

- Keep `allowCustomChannel` in public settings as the administrator-controlled feature flag. The backend preserves the submitted boolean instead of forcing it to `false`.
- Keep custom channel credentials in the existing persisted Zustand config. They are never saved to the Canvas backend and requests continue to go directly from the browser to the configured upstream.
- Add a browser-local `protocol` field with `openai`, `fpbrowser2api`, and `zerofall` values. The UI displays the last value as `zpika`; local image/video requests use the selected protocol, while cloud mode continues to route by the administrator's channel and known model names remain automatic fallbacks.
- Permit local mode for administrators unconditionally and for signed-in ordinary users only when `allowCustomChannel` is enabled. Anonymous visitors and ordinary users when the flag is disabled use the backend channel.

## User Experience

The public admin settings page includes an “允许普通用户自定义渠道” switch. When enabled, ordinary users see the existing channel mode segmented control in “配置与用户偏好”. Local mode presents protocol, Base URL, API Key, a tag-based channel model list, and a “拉取模型” action. Pulled models merge with manually entered models; per-capability selectors determine the image, video, text, and audio model pickers. Image resolution routing is not exposed.

If the administrator disables the switch, the effective mode becomes cloud channel without deleting the user's locally persisted credentials. URL parameter imports follow the same permission rule.

## Error Handling

- Model fetching requires both Base URL and API Key and surfaces the existing localized API error.
- A provider without `/models` support can be configured by manually entering model names.
- The UI states that custom credentials stay in the browser and that the upstream must allow browser CORS requests.

## Tests

- Go service test verifies `allowCustomChannel=true` survives normalization while email verification remains forced on.
- Store tests verify administrators always have access, enabled ordinary users have access, disabled ordinary users and anonymous visitors do not, and the effective configuration respects that decision.
- API tests verify local zpika/fpbrowser2api selections route aliases to their JSON video endpoints without allowing saved local protocol state to override cloud mode.
- UI source tests verify the `zpika` display label, public switch, user protocol field, tag-based model input, and removal of the ordinary-user-only-cloud restriction.
