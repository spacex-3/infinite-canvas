# Infinite Canvas R2 Media Storage Plan

## Session Handoff

This document is the implementation handoff for a separate coding session.
That session owns only `/root/infinite-canvas` and must not modify or deploy
`/root/new-api`.

Before editing, read `/root/infinite-canvas/AGENTS.md` and inspect the live
working tree. Preserve all existing user changes and untracked files. Do not
deploy to ARM or Cloudflare unless the user explicitly authorizes deployment
in that session.

## Objective

Move temporary server-hosted media from the ARM system disk to Cloudflare R2
without changing the browser-local canvas and asset model.

The migration covers two existing server media classes:

1. reference images, videos, and audio uploaded through
   `POST /api/v1/media/references`;
2. generated videos copied by the canvas remote-video cache when a browser
   cannot reliably download the provider URL directly.

Temporary objects have a logical lifetime of 24 hours. Existing API response
envelopes and browser behavior must remain compatible.

## Verified Current State

- Production container: `infinite-canvas-app-1`.
- Production Compose project: `/root/infinite-canvas/docker-compose.local.yml`.
- `/root/infinite-canvas/data` is bind-mounted at `/app/data`.
- The deployed image was built from canvas commit `700124c` when this plan was
  last reviewed.
- `UploadReferenceMedia` writes files under
  `/app/data/reference-media` and serves them through
  `/api/media/references/:id`.
- Reference limits are 30 MiB for images, 50 MiB for video, and 15 MiB for
  audio.
- The remote-video cache writes MP4 files under `/app/data/media-cache`, caps
  one file at 200 MiB, caps local cache use at 5 GiB, runs two downloads at a
  time, and keeps its in-memory task records for 24 hours.
- `StartMediaCleanupScheduler` runs once at application startup and then every
  24 hours. It deletes old files from both `reference-media` and `media-cache`.
- The server media retention setting currently defaults to 7 days. This is a
  real cleanup path; older documentation saying no cleanup exists is stale.
- `cleanupAIImageTasks` only removes in-memory image task records and is not a
  media-file cleanup mechanism.
- `STORAGE_DRIVER` selects the database backend. It is not a media storage
  driver and must not be overloaded for this work.

New API generated artifacts are already stored independently in its own R2
implementation and are normally returned through signed `media.zpika.com`
URLs. Canvas must not modify that bucket, Worker, lifecycle, or secrets.

## Ownership Boundary

Use canvas-owned Cloudflare resources:

- bucket: `zpika-canvas`;
- Worker: `infinite-canvas-media-r2`;
- media domain: `https://canvas-media.zpika.com`;
- reference prefix: `canvas-references/v1/YYYY-MM-DD/<opaque-key>`;
- cache prefix: `canvas-cache/v1/YYYY-MM-DD/<opaque-key>`.

The exact names may be changed during provisioning, but they must remain
separate from New API's `zpika` bucket, `new-api-task-artifact-r2` Worker,
`media.zpika.com` route, and `/root/newapi-vip/artifact.env`.

Do not configure `media.zpika.com` as `MEDIA_PUBLIC_BASE_URL` from the canvas
session. That hostname already belongs to New API and its current Worker does
not implement canvas upload or cache routes.

R2 migration applies only to temporary server media. It must not migrate,
expire, or delete:

- canvas projects stored in browser IndexedDB/localforage;
- "My Assets" media stored in the browser;
- permanent URLs deliberately saved by users;
- New API generated artifacts;
- any future server-side permanent asset library.

If a permanent server asset library is added later, use another bucket or a
prefix with no 24-hour lifecycle rule.

## Target Architecture

### Reference upload

```text
browser
  -> POST /api/v1/media/references on Infinite Canvas
  -> validation and bounded streaming upload
  -> canvas R2 bucket
  -> signed https://canvas-media.zpika.com/v1/media?... URL
  -> upstream image/video provider fetches that URL
```

The browser-to-server upload still passes through the canvas backend. Stream
the request to R2 and do not write a second temporary copy to ARM disk. Direct
browser-to-R2 upload is not required for this migration because it would add a
new presign/finalize protocol for files currently capped at 50 MiB.

### Remote generated-video cache

```text
canvas backend
  -> signed ingest job containing the remote media URL
  -> canvas media Worker pulls the URL directly
  -> Worker streams it into canvas R2
  -> existing cache task reports a signed canvas media URL
  -> browser downloads the object from R2
```

The Worker-pull design keeps the generated-video body off the ARM host. The
backend must not download a remote video and then upload the same bytes to R2.
Retain the current queue/task response contract so existing polling UI keeps
working.

Remote ingest is credentialless in the current canvas behavior. Do not add an
arbitrary client-controlled header forwarding feature. If an authenticated
origin is required later, define an allowlisted server-side credential policy
instead of accepting headers from the browser.

### Media delivery

The private R2 bucket is never made public. A canvas-owned Worker validates a
signed capability URL and serves the object:

```text
GET|HEAD https://canvas-media.zpika.com/v1/media
  ?expires=<unix-seconds>
  &key=<base64url-object-key>
  &sig=<base64url-hmac>
  [&download=1]
  [&name=reference]
```

The signature covers protocol version, object key, and expiry. The Worker must
also check the object's stored logical expiry; a URL expiry alone is not
sufficient.

The returned URL is intentionally opaque and does not need to end in `.png` or
`.mp4`. Correct behavior is defined by `Content-Type`, `Content-Disposition`,
and the response body.

## New API Artifact Optimization

The canvas currently attempts to copy every generated video through its
server-side remote-video cache. That is still a safe compatibility fallback,
but it can duplicate a video that New API has already persisted to R2.

Implement this optimization only after both conditions are verified:

1. the result URL belongs to an explicitly trusted ZPIKA artifact host and
   path, not merely a hostname substring;
2. the artifact response permits the production and test canvas origins to
   perform browser `GET`, `HEAD`, and Range requests.

If those conditions hold, the browser may download the New API artifact
directly and skip the canvas cache. Do not rewrite its hostname, strip its
query parameters, infer a filename from its URL, or copy it into canvas R2.

At present, changing the CORS configuration of `media.zpika.com` belongs to
the New API deployment and is outside the canvas-only session. Therefore the
initial canvas R2 implementation must retain cache fallback when a direct
browser download is not proven to work. Never weaken this to "all HTTPS URLs
can bypass the cache."

## Storage Contract

Keep the existing upload endpoint and response envelope:

```json
{
  "code": 0,
  "data": {
    "id": "opaque-id",
    "url": "https://canvas-media.zpika.com/v1/media?...",
    "mimeType": "image/png",
    "bytes": 12345
  },
  "msg": ""
}
```

Requirements:

- Generate cryptographically random object keys. Do not include user IDs,
  prompts, original filenames, API keys, or sequential IDs.
- Preserve a safe extension only for local compatibility; R2 object identity
  must not depend on an extension.
- Store `Content-Type`, logical expiry, media class, and safe download type as
  object metadata.
- Do not store provider URLs, authorization headers, prompts, or user secrets
  in R2 metadata.
- `GET` and `HEAD` must return the same validators and media metadata.
- Support `Range`, `If-Range`, and `If-None-Match`; valid video ranges return
  `206` with correct `Content-Range` and `Content-Length`.
- Use MIME-derived download extensions. Unknown content is `.bin`; known PNG,
  JPEG, WebP, GIF, MP4, MOV, MP3, and WAV objects must download with their
  correct extension instead of `artifact.bin`.
- Set `X-Content-Type-Options: nosniff` and a restrictive CSP for non-audio,
  non-video objects.
- Never expose the raw R2 S3 endpoint or a permanent public bucket URL.

## Upload Validation

Preserve the current per-media limits and existing user-facing error envelope.
Improve validation while moving storage:

- Enforce a total request limit before multipart parsing.
- Enforce the per-type limit while streaming, even when `Content-Length` is
  absent or false.
- Inspect file signatures using a bounded prefix and reconcile the detected
  type with the submitted MIME type and extension. Do not trust only the
  browser's `Content-Type` or filename.
- Reject empty files and unsupported polyglot/mismatched uploads.
- Abort multipart R2 uploads on every error or cancellation.
- Do not leave `.part` files or incomplete R2 multipart uploads.
- Preserve the currently supported image/video/audio formats unless tests
  prove that R2 or the consuming provider cannot handle one.

## Worker Ingest Security

The backend-to-Worker ingest/status contract must use HMAC authentication with
a key ID, timestamp, nonce, body digest, and constant-time signature check.
Reject replay-age violations before fetching a source.

The Worker must also:

- accept only a strict object-key pattern for the canvas prefixes;
- accept only `http` and `https` source URLs;
- reject credentials embedded in URLs, fragments, localhost, private/reserved
  literal addresses, and HTTPS-to-HTTP redirect downgrade;
- limit redirects and revalidate every redirect target;
- enforce the expected media family and maximum bytes before and during R2
  storage;
- make ingest idempotent for an existing non-expired object;
- abort multipart uploads and delete invalid partial objects;
- return generic external errors without leaking source URLs or secrets.

Reuse the proven behavioral pattern from the New API artifact Worker, but keep
the canvas implementation and resources inside `/root/infinite-canvas`.

## Lifetime And Cleanup

- Set logical expiry to 24 hours from successful upload/cache completion.
- The media Worker rejects expired objects even if R2 lifecycle deletion has
  not run yet.
- Configure an R2 lifecycle rule for both `canvas-references/` and
  `canvas-cache/` with a 24-hour age limit.
- Configure multipart-upload abort cleanup as a separate lifecycle rule.
- Response cache TTL must never exceed the signed URL or object lifetime; cap
  edge/browser cache TTL at 15 minutes.
- R2 lifecycle deletion is asynchronous. Logical expiry is the access-control
  boundary; physical deletion is the storage cleanup boundary.
- Keep the existing local cleanup scheduler for
  `MEDIA_STORAGE_DRIVER=local` and for old local URLs during migration.
- In R2 mode, the admin `mediaRetentionDays` setting applies only to remaining
  local fallback files. It must not silently override the fixed 24-hour R2
  contract.

Do not add any deletion code for browser IndexedDB/localforage. Server media
cleanup and browser-local asset retention are unrelated.

## Configuration

Add media-specific variables instead of overloading `STORAGE_DRIVER`:

```text
MEDIA_STORAGE_DRIVER=local

MEDIA_R2_ENDPOINT=
MEDIA_R2_REGION=auto
MEDIA_R2_BUCKET=zpika-canvas
MEDIA_R2_ACCESS_KEY=
MEDIA_R2_SECRET_KEY=
MEDIA_R2_REFERENCE_PREFIX=canvas-references/v1
MEDIA_R2_CACHE_PREFIX=canvas-cache/v1

MEDIA_PUBLIC_BASE_URL=https://canvas-media.zpika.com
MEDIA_HMAC_SECRET=
MEDIA_RETENTION_SECONDS=86400

MEDIA_WORKER_URL=
MEDIA_WORKER_HMAC_KEY_ID=v1
MEDIA_WORKER_HMAC_SECRET=
MEDIA_WORKER_TIMEOUT_SECONDS=1800
```

Use a bucket-scoped R2 S3 access key for backend uploads. Use a separate
Cloudflare API token with only the permissions needed to deploy the canvas
Worker and bind the canvas bucket. Do not use a Cloudflare Global API Key.

Store production secrets only in the ARM deployment environment and Worker
secret store. Keep `.env`, generated Wrangler state, backups, and secret files
out of Git. Test and production must not share application environment files.

Startup behavior:

- `local`: require the existing `PUBLIC_BASE_URL` and local data directory;
- `r2`: validate every required R2/Worker setting before accepting uploads;
- invalid or partial R2 configuration: fail startup or keep the driver
  explicitly local; never accept an upload and discover configuration is
  missing after reading its body.

## CORS And Provider Access

Allow only the actual production and test canvas origins on the canvas media
Worker. Do not use `Access-Control-Allow-Origin: *` as a substitute for an
origin list.

Support:

- `GET`, `HEAD`, and `OPTIONS`;
- request headers `Range`, `If-Range`, and `If-None-Match`;
- exposed response headers needed for downloads and progress, including
  `Content-Length`, `Content-Range`, `Content-Type`, `Content-Disposition`,
  `ETag`, and `Accept-Ranges`.

Upstream AI providers must be able to fetch a signed reference URL without a
canvas login cookie or Authorization header. Signed URLs are bearer
capabilities: do not log their full query strings.

Canvas image export can be tainted when cross-origin images lack valid CORS.
Verify pixel export/download, not only visible `<img>` rendering.

## Minimal Code Shape

Keep storage behavior behind a small media-store interface owned by the
backend. It should express durable operations such as storing an uploaded
reference and creating/resolving a remote cache object. Do not spread driver
branches across handlers.

The HTTP handlers should continue to:

1. parse and validate request metadata;
2. call the media service;
3. return the existing `{code,data,msg}` envelope.

The implementation should avoid a broad rewrite of image/video generation.
Expected focused areas are:

- media configuration and validation;
- reference upload storage;
- remote-video cache ingest/status;
- media URL signing;
- canvas-owned Worker and tests;
- Compose/example environment documentation;
- focused backend/frontend regression tests.

Do not change New API task routes or artifact URLs from this repository.

## Migration And Rollback

1. Create the private canvas bucket, lifecycle rules, Worker, secrets, and
   `canvas-media.zpika.com` route without changing the running application.
2. Deploy and verify the Worker with synthetic objects and no production
   traffic.
3. Implement the canvas media driver while keeping `local` as the default.
4. Test R2 mode with a separate test environment and separate application
   configuration.
5. Back up the current canvas database, `.env`, Compose file, and local media
   directories before production switch.
6. Set `MEDIA_STORAGE_DRIVER=r2` and recreate only the canvas application
   container. Do not touch New API, its PostgreSQL/Redis containers, or its R2
   configuration.
7. Confirm new uploads and cache objects appear under the two canvas prefixes
   and that ARM media-directory size stops growing.
8. Keep old local files and public local routes for at least the existing
   local retention window. Delete them only after no live task or browser flow
   depends on them.

Rollback is `MEDIA_STORAGE_DRIVER=local` plus application-container recreate.
Objects already returned from R2 remain readable until their 24-hour expiry;
rollback must not delete the bucket or rotate media secrets immediately.

## Verification Matrix

### Reference uploads

- Upload every supported image/video/audio type.
- Exercise zero bytes, exact limits, one byte over each limit, missing length,
  mismatched MIME/extension, and interrupted upload.
- Confirm the API envelope and URL fields remain compatible.
- Confirm upstream providers can fetch the signed URL with both `GET` and
  `HEAD` and no canvas session.

### Delivery

- Verify image and video display from production and test canvas origins.
- Draw a cross-origin image into HTML Canvas and export it successfully.
- Verify full video playback, seek, `Range`, `206`, validators, and `HEAD`.
- Verify preview and download filenames/extensions for each known MIME type.
- Verify invalid signature, modified key, expired URL, expired object, and
  missing object behavior.

### Remote cache

- Confirm the Worker, not ARM, downloads a non-New-API remote video.
- Verify redirect limits, HTTPS downgrade rejection, private-address
  rejection, wrong MIME, oversize source, timeout, and partial-download
  cleanup.
- Verify queue saturation and application restart behavior remain explicit.
- Verify trusted New API artifacts use direct download only when CORS has been
  proven; otherwise verify automatic cache fallback still succeeds.

### Operations

- Confirm R2 object count and bytes rise for new media and lifecycle removes
  expired objects.
- Confirm `/app/data/reference-media` and `/app/data/media-cache` stop growing
  in R2 mode.
- Restart the canvas container and verify existing signed URLs still work.
- Roll back to local mode and verify new local uploads still work.
- Confirm browser-local projects and "My Assets" are unchanged.
- Confirm the New API `zpika` bucket, `media.zpika.com` Worker, and production
  artifact configuration are unchanged.

## Acceptance Criteria

- New temporary reference uploads do not consume ARM disk in R2 mode.
- Necessary generated-video cache objects do not consume ARM disk in R2 mode.
- Remote cache pulls happen Worker-to-origin rather than through ARM.
- Upstream providers receive a stable, signed canvas-controlled media URL.
- Temporary objects become inaccessible after 24 hours and are covered by R2
  lifecycle deletion.
- Known media types preview and download with correct MIME types and file
  extensions.
- Existing API envelopes, task polling, canvas display, and browser-local
  persistence continue to work.
- New API artifacts are not blindly duplicated when direct browser retrieval
  is verified, and compatibility fallback remains available otherwise.
- No Cloudflare Global API Key is required or stored.
- Production/test and Canvas/New API resources remain isolated.
