# Infinite Canvas Media Worker

Canvas-owned temporary media Worker. It uses the private `zpika-canvas` R2
bucket and must remain isolated from New API's artifact Worker and bucket.

Required Worker secrets:

```bash
npx wrangler secret put INGEST_HMAC_SECRET
npx wrangler secret put MEDIA_HMAC_SECRET
```

Deploy after creating the bucket and confirming the custom domain:

```bash
npx wrangler r2 bucket create zpika-canvas
npx wrangler deploy
```

Configure R2 lifecycle rules for both `canvas-references/` and
`canvas-cache/` at one day, plus an incomplete multipart upload abort rule.
Logical expiry in the Worker remains the access boundary even if lifecycle
deletion runs later.

The application and Worker share `MEDIA_HMAC_SECRET`. The application
`MEDIA_WORKER_HMAC_SECRET` equals the Worker `INGEST_HMAC_SECRET`. Store all
values only in the ARM deployment environment and Wrangler secret store.
