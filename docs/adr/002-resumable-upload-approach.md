# ADR-002: Resumable upload approach

**Status:** Proposed
**Date:** 2026-10-02
**Author:** Vivek (drafted with Claude)

## Context
US-5: a creator uploads a delivery video (MP4/MOV, up to 5 GB). The upload must go directly from the browser to storage in chunks and never pass through the API (CLAUDE.md). It needs a progress bar, must resume after a dropped connection or page reload, must be verified (size, type) before the order is marked delivered, and abandoned incomplete uploads must be cleaned up within 24 hours.

Constraints:
- Storage is Cloudflare R2, which is S3-compatible; the API uses the AWS SDK v3 (CLAUDE.md, architecture.md).
- Delivery triggers the payment capture (ADR-001), and the capture must happen inside the card hold. A failed or slow upload therefore has a money consequence: the upload must finish before the order's due date.
- Hosting: the API runs on Railway and the web app on Vercel, so neither is a good place to proxy multi-gigabyte request bodies.

## Options considered
### Option A — S3 multipart upload with presigned part URLs
The API starts a multipart upload (`CreateMultipartUpload`) and returns presigned `UploadPart` URLs. The browser slices the file into parts, uploads each part with a plain `PUT` straight to R2, and collects each part's `ETag`. The API then calls `CompleteMultipartUpload` with the list of part numbers and ETags. To resume, the API asks R2 which parts exist (`ListParts`) and the browser uploads only the missing ones.
- Pros: bytes never touch our servers. No extra service. Resume state lives in R2 itself, so it is hard to get out of sync. Directly matches the standard AWS/R2 mechanism, so it is well documented and explainable.
- Cons: the client has to implement slicing, concurrency, retries, and ETag bookkeeping itself. R2 needs CORS configured to expose the `ETag` header. R2 expects equal part sizes except for the last part (check the R2 docs). Presigned URLs expire, so a long upload needs fresh ones.

### Option B — TUS protocol
A resumable-upload protocol with ready-made clients (tus-js-client) and servers (tusd).
- Pros: the client is much simpler, and resume is a protocol feature.
- Cons: it needs a TUS server in the path. Either bytes pass through our API (breaks the rule), or we run a separate service such as tusd with an S3 backend (another thing to deploy, monitor, and secure). It hides the multipart mechanics we want to learn.

### Option C — Single presigned `PUT`
One presigned URL, one request for the whole file.
- Pros: trivially simple.
- Cons: no resume, so any interruption restarts a multi-gigabyte upload, and there are single-request size limits (check the R2 limit for a single object upload). Fails US-5.

## Decision
Option A: S3 multipart upload directly to R2 using presigned part URLs, with the API owning the multipart upload lifecycle (create, list parts, complete, abort) and Postgres recording the upload.

## Why
- It is the only option that satisfies "direct to storage, resumable, no extra service" with the stack already chosen.
- R2 is the source of truth for which parts exist, so resume asks R2 (`ListParts`) and does not trust the browser's memory.
- It teaches the real mechanism (parts, ETags, completion, abort) that underlies most large-file upload systems, which is the learning goal for this project.
- TUS was rejected for the extra service and the bytes-through-a-server problem. A single `PUT` was rejected because it cannot resume.

## Consequences
- What becomes easier:
  - The API stays small and stateless with respect to video bytes.
  - Resume works across tabs and devices because the state is in R2, plus the upload record in Postgres.
- What becomes harder / new risks we accept:
  - Client complexity: slicing `Blob`s, 3–4 parts in flight, retry with backoff per part, a progress bar computed from part progress, and pause/resume.
  - Part size must be chosen so that 5 GB stays under the 10,000-part limit and above the 5 MiB minimum (for example, 64 MiB parts gives about 80 parts). Confirm the exact limits and the equal-part-size rule in the R2 docs.
  - The client must never choose the object key. The server generates it (for example `orders/{orderId}/delivery/{uuid}`) so a user cannot overwrite another order's file.
  - A client can lie about file type and size. On completion the API checks the object's size with `HeadObject` and reads the first bytes with a ranged `GET` to confirm an MP4/MOV container, before marking the order delivered.
  - Completion must be idempotent: a double `Complete` call (retry, two tabs) must not produce two deliveries or two captures.
- What we must build or monitor:
  - An `uploads` table (order, upload id, object key, part size, status) and a state in the order's state machine for "uploading".
  - R2 CORS rules that allow `PUT` from the web origin and expose `ETag`.
  - Cleanup: an R2 lifecycle rule to abort incomplete multipart uploads, plus a scheduled sweep for uploads older than 24 hours (the scheduler is ADR-003), since the lifecycle rule's granularity may be coarser than the PRD's 24 hours.
  - Metrics for upload completion rate and resumed uploads that complete (PRD §7).

## References
- Cloudflare R2: [S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/) and [multipart uploads](https://developers.cloudflare.com/r2/objects/multipart-objects/)
- Cloudflare R2: [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- AWS: [Multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- tus.io: [Protocol](https://tus.io/protocols/resumable-upload) (for the rejected option)
