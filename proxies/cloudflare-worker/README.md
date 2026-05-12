# Context as a Service -- Cloudflare Workers

A Cloudflare Worker that acts as a BFF for server-side Uniform Context personalization. Runs on Cloudflare's global edge network with near-zero cold starts.

## How it works

A single `fetch` handler receives all requests, resolves personalization and A/B tests against Uniform's Route API, and returns a clean composition.

1. Reads `visitor-id` header and fetches the visitor's profile from the mock CDP to build quirks.
2. Forwards all incoming query parameters to the Uniform Route API with `projectId` and `x-api-key`.
3. Walks the composition tree to resolve personalization and A/B test nodes.
4. Strips SDK metadata (`$pzCrit`, `$tstVrnt`, `pz`, `control`, `id`) from resolved nodes.
5. Returns the processed composition with upstream headers preserved. Errors are passed through unchanged.

## Project structure

```
cloudflare-worker/
+-- src/
|   +-- index.ts                Worker entry point
|   +-- context-manifest.json   Uniform Context manifest
+-- wrangler.toml               Wrangler config (gitignored)
+-- wrangler.toml.example       Template config
+-- .env.example                Local dev env vars
+-- package.json
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
cp wrangler.toml.example wrangler.toml
```

Set `UNIFORM_API_KEY` and `UNIFORM_PROJECT_ID` in both files.

### 3. Download the context manifest

```bash
npm run uniform:manifest
```

### 4. Run locally

```bash
npm run dev
```

Worker starts at `http://localhost:8787`.

## API

### `GET /api/v1/route?path=<page-path>`

All query parameters are forwarded to the Uniform Route API.

**Headers:**

| Header       | Required | Description                           |
|--------------|----------|---------------------------------------|
| `visitor-id` | No       | Visitor identifier for profile lookup |

**Example:**

```bash
curl "http://localhost:8787/api/v1/route?path=/" \
  -H "visitor-id: 123"
```

## Environment variables

Configured via `wrangler.toml` `[vars]` section or Wrangler secrets for production.

| Variable                    | Required | Default                        | Description                          |
|-----------------------------|----------|--------------------------------|--------------------------------------|
| `UNIFORM_API_KEY`           | Yes      | --                             | Uniform Canvas Route API key         |
| `UNIFORM_PROJECT_ID`        | Yes      | --                             | Uniform project identifier           |
| `UNIFORM_CLI_BASE_EDGE_URL` | No      | `https://uniform.global`       | Override Uniform API base URL        |
| `PROFILE_SERVICE_URL`       | No      | `https://cdpmock.vercel.app`   | Override mock profile service URL    |

## Deployment

```bash
npm run deploy
```

Ensure credentials are configured as Wrangler secrets (recommended) or `[vars]` before deploying:

```bash
wrangler secret put UNIFORM_API_KEY
wrangler secret put UNIFORM_PROJECT_ID
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Local dev server via Wrangler |
| `npm run deploy` | Deploy to Cloudflare |
| `npm test` | Run tests (Vitest) |
| `npm run uniform:manifest` | Download context manifest from Uniform |
