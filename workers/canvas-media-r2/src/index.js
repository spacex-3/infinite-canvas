const VERSION = "v1";
const MAX_JOB_BYTES = 64 * 1024;
const MAX_JOB_AGE_SECONDS = 300;
const MAX_LIFETIME_SECONDS = 24 * 60 * 60;
const PART_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const KEY_PATTERN = /^canvas-(?:references|cache)\/v1\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function endpointPath(pathname) {
  for (const endpoint of ["/v1/ingest", "/v1/status", "/v1/media"]) {
    if (pathname === endpoint || pathname.endsWith(endpoint)) return endpoint;
  }
  return "";
}

function base64URL(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64URL(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

function validateObjectKey(value) {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

function isBlockedHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":")) return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224 ||
    (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
}

function parseSourceURL(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("invalid source URL"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || isBlockedHostname(parsed.hostname)) {
    throw new Error("rejected source URL");
  }
  return parsed;
}

async function authenticateJob(request, env, body) {
  const keyID = request.headers.get("X-Canvas-Media-Key-Id") || "";
  const timestampText = request.headers.get("X-Canvas-Media-Timestamp") || "";
  const nonce = request.headers.get("X-Canvas-Media-Nonce") || "";
  const signatureText = request.headers.get("X-Canvas-Media-Signature") || "";
  const timestamp = Number(timestampText);
  const now = Math.floor(Date.now() / 1000);
  if (keyID !== env.INGEST_HMAC_KEY_ID || !env.INGEST_HMAC_SECRET || !Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_JOB_AGE_SECONDS || !/^[A-Za-z0-9_-]{20,64}$/.test(nonce)) return false;
  let actual;
  try { actual = decodeBase64URL(signatureText); } catch { return false; }
  const message = [VERSION, request.method, new URL(request.url).pathname, timestampText, nonce, await sha256Hex(body)].join("\n");
  return timingSafeEqual(actual, await hmac(env.INGEST_HMAC_SECRET, message));
}

function validateJob(input, env, statusOnly = false) {
  const now = Math.floor(Date.now() / 1000);
  if (!input || input.version !== VERSION || !validateObjectKey(input.object_key) || !Number.isInteger(input.expires_at) || input.expires_at <= now || input.expires_at > now + MAX_LIFETIME_SECONDS) {
    throw new Error("invalid job");
  }
  if (statusOnly) return input;
  const maxBytes = Number(input.max_bytes);
  if (input.media_class !== "video" || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > Number(env.MAX_MEDIA_BYTES || 209715200) || !input.source || input.source.method !== "GET" || input.source.credentialless !== true) {
    throw new Error("invalid ingest job");
  }
  return { ...input, max_bytes: maxBytes, source: { url: parseSourceURL(input.source.url) } };
}

async function fetchSource(source) {
  let current = source.url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(current, { method: "GET", headers: { Accept: "video/mp4,video/*;q=0.9" }, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects === MAX_REDIRECTS) throw new Error("too many redirects");
    const location = response.headers.get("Location");
    if (!location) throw new Error("redirect without location");
    const next = parseSourceURL(new URL(location, current).toString());
    if (current.protocol === "https:" && next.protocol !== "https:") throw new Error("HTTPS downgrade");
    current = next;
  }
  throw new Error("unreachable redirect state");
}

async function multipartPut(bucket, key, body, options, maxBytes) {
  const upload = await bucket.createMultipartUpload(key, options);
  const reader = body.getReader();
  const parts = [];
  let chunks = [];
  let buffered = 0;
  let total = 0;
  let partNumber = 1;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error("source too large");
      chunks.push(chunk);
      buffered += chunk.byteLength;
      if (buffered < PART_BYTES) continue;
      const part = new Uint8Array(buffered);
      let offset = 0;
      for (const item of chunks) { part.set(item, offset); offset += item.byteLength; }
      parts.push(await upload.uploadPart(partNumber++, part));
      chunks = [];
      buffered = 0;
    }
    if (buffered === 0 && parts.length === 0) throw new Error("empty source");
    if (buffered > 0) {
      const part = new Uint8Array(buffered);
      let offset = 0;
      for (const item of chunks) { part.set(item, offset); offset += item.byteLength; }
      parts.push(await upload.uploadPart(partNumber, part));
    }
    await upload.complete(parts);
    return total;
  } catch (error) {
    await upload.abort();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function validateStoredVideo(bucket, key) {
  const object = await bucket.get(key, { range: { offset: 0, length: 12 } });
  if (!object || !object.body) return false;
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
}

async function ingest(job, env) {
  let parsed;
  try { parsed = validateJob(job, env); } catch { return json({ error: "invalid_request" }, 400); }
  const existing = await env.MEDIA_BUCKET.head(parsed.object_key);
  if (existing && !objectExpired(existing)) return json({ ready: true, size: existing.size });
  if (existing) await env.MEDIA_BUCKET.delete(parsed.object_key);
  try {
    const response = await fetchSource(parsed.source);
    if (response.status !== 200 || !response.body) throw new Error("source failed");
    const contentType = (response.headers.get("Content-Type") || parsed.mime_type || "").split(";", 1)[0].toLowerCase();
    if (contentType && contentType !== "application/octet-stream" && !contentType.startsWith("video/")) throw new Error("wrong media family");
    const length = Number(response.headers.get("Content-Length") || 0);
    if (length > parsed.max_bytes) throw new Error("source too large");
    const options = { httpMetadata: { contentType: contentType === "application/octet-stream" || !contentType ? "video/mp4" : contentType }, customMetadata: { expires_at: String(parsed.expires_at), media_class: "video", download_type: "video/mp4" } };
    await multipartPut(env.MEDIA_BUCKET, parsed.object_key, response.body, options, parsed.max_bytes);
    const stored = await env.MEDIA_BUCKET.head(parsed.object_key);
    if (!stored || stored.size <= 0 || stored.size > parsed.max_bytes || !await validateStoredVideo(env.MEDIA_BUCKET, parsed.object_key)) throw new Error("stored video invalid");
    return json({ ready: true, size: stored.size }, 201);
  } catch {
    await env.MEDIA_BUCKET.delete(parsed.object_key);
    return json({ error: "ingest_failed" }, 502);
  }
}

function objectExpired(object) {
  const expires = Number(object && object.customMetadata && object.customMetadata.expires_at);
  return !Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000);
}

async function status(job, env) {
  try { validateJob(job, env, true); } catch { return json({ error: "invalid_request" }, 400); }
  const object = await env.MEDIA_BUCKET.head(job.object_key);
  if (!object || objectExpired(object)) return json({ ready: false }, 404);
  return json({ ready: true, size: object.size, mime_type: object.httpMetadata && object.httpMetadata.contentType || "" });
}

function mediaMessage(key, expires) { return [VERSION, key, String(expires)].join("\n"); }

async function verifyMediaURL(url, env) {
  const expires = Number(url.searchParams.get("expires"));
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  let key, actual;
  try {
    key = new TextDecoder().decode(decodeBase64URL(url.searchParams.get("key") || ""));
    actual = decodeBase64URL(url.searchParams.get("sig") || "");
  } catch { return null; }
  if (!validateObjectKey(key)) return null;
  return timingSafeEqual(actual, await hmac(env.MEDIA_HMAC_SECRET || "", mediaMessage(key, expires))) ? { key, expires } : null;
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  return String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).includes(origin) ? origin : "";
}

function applyCORS(request, env, headers) {
  const origin = allowedOrigin(request, env);
  if (origin) { headers.set("Access-Control-Allow-Origin", origin); headers.append("Vary", "Origin"); }
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type, Content-Disposition, ETag, Accept-Ranges");
}

function applyObjectHeaders(object, headers) {
  if (object.writeHttpMetadata) object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag || object.etag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("X-Content-Type-Options", "nosniff");
  const type = (headers.get("Content-Type") || "").toLowerCase();
  if (!type.startsWith("video/") && !type.startsWith("audio/")) headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
}

function extension(contentType) {
  return ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" })[String(contentType || "").split(";", 1)[0].toLowerCase()] || "bin";
}

function downloadName(url, object, contentType) {
  const requested = url.searchParams.get("name") || "";
  const fallback = String(object.customMetadata && object.customMetadata.media_class || "media");
  const name = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(requested) ? requested : fallback;
  return `${name}.${extension(contentType)}`;
}

function matchesETag(value, object) {
  if (!value) return false;
  return value.split(",").map((item) => item.trim()).includes(object.httpEtag) || value.split(",").map((item) => item.trim()).includes(object.etag);
}

async function media(request, env) {
  const url = new URL(request.url);
  const verified = await verifyMediaURL(url, env);
  if (!verified) return json({ error: "not_found" }, 404);
  const head = await env.MEDIA_BUCKET.head(verified.key);
  if (!head) return json({ error: "not_found" }, 404);
  if (objectExpired(head)) { await env.MEDIA_BUCKET.delete(verified.key); return json({ error: "expired" }, 410); }
  const headers = new Headers();
  applyObjectHeaders(head, headers);
  applyCORS(request, env, headers);
  headers.set("Cache-Control", `public, max-age=${Math.max(0, Math.min(verified.expires - Math.floor(Date.now() / 1000), 900))}`);
  if (matchesETag(request.headers.get("If-None-Match"), head)) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") { headers.set("Content-Length", String(head.size)); return new Response(null, { status: 200, headers }); }
  const requestedRange = request.headers.get("Range");
  const ifRange = request.headers.get("If-Range");
  const range = requestedRange && (!ifRange || matchesETag(ifRange, head)) ? requestedRange : "";
  const object = range ? await env.MEDIA_BUCKET.get(verified.key, { range: new Headers({ Range: range }) }) : await env.MEDIA_BUCKET.get(verified.key);
  if (!object) return json({ error: "not_found" }, 404);
  applyObjectHeaders(object, headers);
  if (url.searchParams.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="${downloadName(url, object, headers.get("Content-Type"))}"`);
  if (range && object.range) {
    headers.set("Content-Range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    headers.set("Content-Length", String(object.range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

async function signedJob(request, env) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_JOB_BYTES) return json({ error: "request_too_large" }, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_JOB_BYTES) return json({ error: "request_too_large" }, 413);
  if (!await authenticateJob(request, env, body)) return json({ error: "not_found" }, 404);
  let job;
  try { job = JSON.parse(new TextDecoder().decode(body)); } catch { return json({ error: "invalid_request" }, 400); }
  return endpointPath(new URL(request.url).pathname) === "/v1/status" ? status(job, env) : ingest(job, env);
}

export default {
  async fetch(request, env) {
    const endpoint = endpointPath(new URL(request.url).pathname);
    if (request.method === "POST" && ["/v1/ingest", "/v1/status"].includes(endpoint)) return signedJob(request, env);
    if (["GET", "HEAD"].includes(request.method) && endpoint === "/v1/media") return media(request, env);
    if (request.method === "OPTIONS" && endpoint === "/v1/media") {
      if (request.headers.get("Origin") && !allowedOrigin(request, env)) return json({ error: "not_found" }, 404);
      const headers = new Headers({ "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match", "Access-Control-Max-Age": "900" });
      applyCORS(request, env, headers);
      return new Response(null, { status: 204, headers });
    }
    return json({ error: "not_found" }, 404);
  },
};

export { authenticateJob, endpointPath, hmac, isBlockedHostname, mediaMessage, timingSafeEqual, validateJob, validateObjectKey };
