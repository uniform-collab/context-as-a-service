# Context as a Service

Edge-side personalization powered by [Uniform](https://uniform.dev). This project moves personalization logic out of the frontend and into a lightweight edge function that acts as a BFF (Backend for Frontend), resolving personalized content variants, A/B tests, and time-based visibility — all at the edge, before the response reaches the client.

> **Note:** This demo uses [Cloudflare Workers](https://workers.cloudflare.com) as a reference implementation, but the approach is platform-agnostic. The same pattern works on any edge compute platform — [Akamai EdgeWorkers](https://www.akamai.com/products/serverless-computing-edgeworkers), [Vercel Edge Middleware](https://vercel.com/docs/functions/edge-middleware), AWS CloudFront Functions, Fastly Compute, Deno Deploy, and others. The core logic (Uniform Context evaluation, composition tree walking, variant resolution) is standard JavaScript with no Cloudflare-specific APIs.

## Why

Traditional personalization runs client-side, which means layout shifts, flicker, and shipping personalization SDKs to the browser. By running Uniform Context on a Cloudflare Worker, the response arrives fully resolved — the client gets exactly the content it should display, with zero runtime personalization overhead.

## How it works

```
Client ─── visitor-id ──▶ Worker ──▶ CDP (profile lookup)
                            │
                            ▼
                      Uniform Route API
                            │
                            ▼
                     Context Engine
                   (personalize + test)
                            │
                            ▼
                   Resolved composition ──▶ Client
```

1. The client sends a request with an optional `visitor-id` header.
2. The worker looks up the visitor's profile from a CDP (customer data platform) to build **quirks** — key-value pairs like `audience`, `geoAudience`, and `hasReservation`.
3. It fetches the page composition from Uniform's Route API.
4. Using the downloaded **context manifest** and the visitor's quirks, it walks the composition tree and:
   - Resolves **personalization** nodes to the best-matching variant
   - Picks an **A/B test** variant
   - Removes components outside their **date window** (`start`/`end` parameters)
5. Returns the fully resolved composition as JSON.

## Project structure

```
├── worker/          Cloudflare Worker (the BFF)
│   ├── src/
│   │   └── index.ts     Worker entry point
│   ├── wrangler.toml    Wrangler config
│   └── package.json
│
├── client/          Minimal Node.js client for testing
│   └── index.mjs
│
└── readme.md
```

## Prerequisites

- Node.js 18+
- A [Uniform](https://uniform.dev) project with Canvas compositions and a context manifest
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed as a dev dependency)

## Setup

### 1. Install dependencies

```bash
cd worker && npm install
cd ../client && npm install
```

### 2. Configure environment

Copy the example files and fill in your Uniform credentials:

```bash
cp worker/.env.example worker/.env
cp worker/wrangler.toml.example worker/wrangler.toml
```

Set `UNIFORM_API_KEY` and `UNIFORM_PROJECT_ID` in both `.env` (for local dev) and `wrangler.toml` (for deployment).

### 3. Download the context manifest

```bash
cd worker
npx uniform context manifest download --output ./src/context-manifest.json
```

Or use the shorthand script:

```bash
npm run uniform:manifest
```

This downloads your project's personalization and testing rules so the worker can evaluate them at the edge.

### 4. Run locally

```bash
cd worker
npm run dev
```

The worker starts at `http://localhost:8787`.

### 5. Test with the client

In a separate terminal:

```bash
cd client
npm start
```

This sends a request with `visitor-id: 123` and logs the resolved page title.

## API

### `GET /api/v1/route?path=<page-path>`

Proxies to Uniform's Route API with server-side personalization applied.

**Headers:**

| Header       | Required | Description                              |
| ------------ | -------- | ---------------------------------------- |
| `visitor-id` | No       | Visitor identifier for profile lookup    |

**Response:** The full Uniform route response with all personalization and test nodes resolved inline.

## Deployment

```bash
cd worker
npm run deploy
```

Make sure `UNIFORM_API_KEY` and `UNIFORM_PROJECT_ID` are configured as secrets or vars in your `wrangler.toml` before deploying.

## Tech stack

- **Runtime:** Cloudflare Workers
- **Personalization:** Uniform Context + Canvas (`@uniformdev/context`, `@uniformdev/canvas`)
- **Language:** TypeScript
- **Testing:** Vitest with `@cloudflare/vitest-pool-workers`
- **Config:** Wrangler, dotenv-cli
