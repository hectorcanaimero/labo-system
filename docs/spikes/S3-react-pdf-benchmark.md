# Spike S3: `@react-pdf` server-side runtime

## Decision

**Keep ADR-02: render PDFs in a Next.js Route Handler with `runtime = "nodejs"`.**
The POC renders a two-page PDF with `renderToStream`, returns the Node stream as a
Web `ReadableStream`, and keeps Convex access request-scoped. Convex actions remain
the fallback for a future deployment where the Next.js runtime cannot carry the
renderer dependency, but they are not the default path.

The task file list maps the spike endpoint to `apps/web/app/api/pdf/route.ts`, so
the local URL is `GET /api/pdf`.

## POC contract

### Request

- `GET /api/pdf`
- Reads the Convex session JWT from `__convexAuthJWT` (or
  `CONVEX_AUTH_COOKIE_NAME` when configured).
- In development, `?assetUrl=<url>` can override the image URL for a repeatable
  cache test. Production only accepts the URL returned by the Convex query or
  `PDF_SPIKE_ASSET_URL`.
- `?invalidateAsset=1` invalidates the selected asset (or the whole in-memory
  cache when no asset URL is selected).

### Response

- `200 application/pdf`, inline filename `react-pdf-spike.pdf`.
- Two A4 pages containing hardcoded fallback lab data and one PNG logo.
- `X-PDF-Asset-Cache`: `embedded`, `miss`, or `hit`.
- `X-PDF-Convex-Source`: `hardcoded` or `convex`.
- `Server-Timing: pdf-setup;dur=...` and a structured
  `pdf_render_duration_ms` log with peak RSS.

### Convex integration

Set `PDF_SPIKE_CONVEX_QUERY` to a public query path, for example
`api.pdfSpike.payload`. The query must return:

```ts
{
  laboratory: string;
  patient: string;
  reportId: string;
  lines: { test: string; result: string; unit: string }[];
  assetUrl?: string; // signed Convex File Storage URL
}
```

`convexServerClient(token)` creates a new authenticated `ConvexHttpClient` for
each request from `NEXT_PUBLIC_CONVEX_URL`. The client is intentionally not
module-global because its auth state is mutable.

## Asset cache

The route stores the fetched PNG as a base64 data URI in a module-local `Map`.
Entries expire after **5 minutes** (`ASSET_CACHE_TTL_MS`) and are removed before
fetching when expired. The cache key is the complete signed URL, which naturally
avoids serving an asset from a different Convex storage token. A response sequence
of `miss → hit → miss` with `invalidateAsset=1` verifies both reuse and manual
invalidation.

The implementation rejects non-PNG responses and limits the asset to 5 MiB before
and after reading the response body.

## Measurements

### Local renderer smoke (Node 22, macOS, 10 sequential `renderToStream` runs)

This is a renderer-only smoke, not an HTTP/Next/Vercel measurement. It used the
same two-page shape and embedded 1×1 PNG used by the POC. Values are wall-clock
milliseconds for stream completion:

| Run |     1 |    2 |    3 |    4 |    5 |    6 |    7 |    8 |    9 |   10 |
| --: | ----: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
|  ms | 63.98 | 6.64 | 4.27 | 4.04 | 4.85 | 2.92 | 2.30 | 2.05 | 2.38 | 2.13 |

- Cold run: **63.98 ms**.
- Warm p50 (runs 2–10): **2.92 ms**.
- Warm p95 (runs 2–10, nearest-rank): **6.64 ms**.
- Observed process RSS after the run: **109,248,512 bytes (~104.2 MiB)**.
- The renderer-only smoke is below the 3 s target; it does **not** prove the
  end-to-end Vercel p95.

### Required Vercel preview measurement

The repository does not contain Vercel credentials or a deployed preview, and the
task explicitly forbids running a build. Therefore the following deployment-level
measurements are intentionally recorded as **pending**, rather than fabricated:

| Metric            | Result                     | How to collect                                                                                          |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cold p95          | Pending preview deployment | 10 first-hit requests after a fresh isolate; use `Server-Timing` and request duration                   |
| Warm p95          | Pending preview deployment | 10 sequential requests to the same preview; use `Server-Timing` and request duration                    |
| Route bundle size | Pending preview build      | Inspect the generated Next server route artifact; do not use the installed package size as a substitute |
| Peak memory       | Exposed by route log       | Aggregate `peakRssBytes` from `pdf_render_duration_ms` logs                                             |

For context only, the installed `@react-pdf` dependency graph occupies about
**18.3 MiB** on disk in this workspace. This is not the bundled Route Handler
size; the latter must be measured from the deployment artifact.

## Route Handler vs Convex action

| Concern            | Next Route Handler (chosen)                                                 | Convex action (`"use node"`)                                              |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PDF streaming      | Native response body from `renderToStream`                                  | Requires forwarding the generated stream/bytes through an action boundary |
| Authenticated data | Cookie JWT → request-scoped Convex HTTP client                              | Native Convex identity/context, but coupling renderer to Convex runtime   |
| Asset URLs         | Fetch signed Convex Storage URL in the same request; 5-minute process cache | Fetch is straightforward, but cache lifetime follows action workers       |
| Bundle isolation   | `@react-pdf/renderer` stays in one Node route                               | Renderer becomes part of the Convex Node action bundle                    |
| Operational risk   | Requires Node runtime and deployment bundle measurement                     | Requires `"use node"` boundaries and action memory/time limits            |
| Decision           | **Default for F2 PDFs**                                                     | **Plan B** if the target hosting cannot run the Node route                |

## Gotchas and follow-up contract

1. The route must explicitly export `runtime = "nodejs"`; `@react-pdf/renderer`
   must not be imported by an Edge route.
2. Keep renderer imports server-only. Do not re-export the document component from
   a client component or a shared browser barrel.
3. Use `renderToStream` rather than `renderToBuffer` so the response can start
   streaming without an additional buffer copy.
4. The default font is used intentionally. Custom font registration is deferred
   to F2 and should be benchmarked separately.
5. Convex query data is validated at the boundary before it reaches the PDF tree;
   an invalid query payload returns HTTP 500 instead of silently producing a bad
   report.
6. For F2, replace the hardcoded payload with a typed query contract and keep
   `convexServerClient(token)` request-scoped. Preserve the response headers and
   `pdf_render_duration_ms` metric so production p95 remains observable.

## Validation performed

- `pnpm --filter @labo/pdf typecheck` — passed.
- `pnpm --filter @labo/web typecheck` — passed.
- Direct Node smoke of `renderToStream` — 10/10 streams completed.
- No build was executed.
