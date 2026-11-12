import { describe, expect, test } from "bun:test";
import worker, { hmac, isBlockedHostname, mediaMessage, timingSafeEqual, validateJob, validateObjectKey } from "./index.js";

function base64URL(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("canvas media worker", () => {
  test("accepts only canvas temporary prefixes", () => {
    expect(validateObjectKey("canvas-references/v1/2026-11-12/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    expect(validateObjectKey("canvas-cache/v1/2026-11-12/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    expect(validateObjectKey("new-api/v1/2026-11-12/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    expect(validateObjectKey("canvas-cache/v1/2026-11-12/../secret")).toBe(false);
  });

  test("rejects local and reserved source targets", () => {
    for (const host of ["localhost", "api.localhost", "127.0.0.1", "10.0.0.1", "172.20.1.2", "192.168.1.1", "169.254.1.1", "::1"]) {
      expect(isBlockedHostname(host)).toBe(true);
    }
    expect(isBlockedHostname("cdn.example.com")).toBe(false);
  });

  test("validates a credentialless video ingest job", () => {
    const now = Math.floor(Date.now() / 1000);
    const job = validateJob({
      version: "v1",
      object_key: "canvas-cache/v1/2026-11-12/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      expires_at: now + 3600,
      media_class: "video",
      mime_type: "video/mp4",
      max_bytes: 1024,
      source: { url: "https://cdn.example.com/video.mp4", method: "GET", credentialless: true },
    }, { MAX_MEDIA_BYTES: "2048" });
    expect(job.max_bytes).toBe(1024);
  });

  test("serves signed full, range, HEAD, and named download responses", async () => {
    const secret = "abcdef0123456789abcdef0123456789";
    const key = "canvas-cache/v1/2026-11-12/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signature = base64URL(await hmac(secret, mediaMessage(key, expires)));
    const encodedKey = base64URL(new TextEncoder().encode(key));
    const metadata = {
      size: 5, etag: "etag-1", httpEtag: '"etag-1"', httpMetadata: { contentType: "video/mp4" },
      customMetadata: { expires_at: String(expires + 300), media_class: "video" },
      writeHttpMetadata(headers) { headers.set("Content-Type", "video/mp4"); },
    };
    const bucket = {
      async head() { return metadata; },
      async get(_key, options) {
        if (options) return { ...metadata, body: new Response("ide").body, range: { offset: 1, length: 3 } };
        return { ...metadata, body: new Response("video").body };
      },
      async delete() {},
    };
    const base = `https://canvas-media.example/v1/media?key=${encodedKey}&expires=${expires}&sig=${signature}`;
    const range = await worker.fetch(new Request(base, { headers: { Range: "bytes=1-3" } }), { MEDIA_BUCKET: bucket, MEDIA_HMAC_SECRET: secret });
    expect(range.status).toBe(206);
    expect(range.headers.get("Content-Range")).toBe("bytes 1-3/5");
    expect(await range.text()).toBe("ide");
    const head = await worker.fetch(new Request(base, { method: "HEAD" }), { MEDIA_BUCKET: bucket, MEDIA_HMAC_SECRET: secret });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("5");
    const download = await worker.fetch(new Request(base + "&download=1&name=result"), { MEDIA_BUCKET: bucket, MEDIA_HMAC_SECRET: secret });
    expect(download.headers.get("Content-Disposition")).toBe('attachment; filename="result.mp4"');
  });

  test("signatures bind key and expiry", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const key = "canvas-references/v1/2026-11-12/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(timingSafeEqual(await hmac(secret, mediaMessage(key, 100)), await hmac(secret, mediaMessage(key, 100)))).toBe(true);
    expect(timingSafeEqual(await hmac(secret, mediaMessage(key, 100)), await hmac(secret, mediaMessage(key, 101)))).toBe(false);
  });
});
