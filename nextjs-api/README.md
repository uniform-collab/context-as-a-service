# Context as a Service — Next.js

A Next.js port of the [Cloudflare Worker Context Service](../cloudflare-worker/), providing **server-side Uniform Context personalization** as a Backend-for-Frontend (BFF). This project ships two interchangeable execution modes inside a single Next.js app:

| Mode | Runtime | Target environment |
|------|---------|-------------------|
| **A — API Route** | Node.js | Self-hosted Next.js (Azure, Docker, AWS, etc.) |
| **B — Edge Middleware** | Vercel Edge | Vercel deployments |

Both modes expose the same API contract — `GET /api/v1/route?path=<page-path>` — and produce identical output.

---

## How it works

The service acts as a transparent proxy between your frontend and the Uniform Canvas Route API. Before returning the composition to the client, it **resolves personalization, A/B tests, and date-windowed content on the server**, so the browser receives a fully processed composition with no client-side evaluation overhead.

```
                                  ┌────────────────────┐
                                  │  CDP Mock Service   │
                                  │  (visitor profiles) │
                                  └────────┬───────────┘
                                           │ profile
                                           │ lookup
┌──────────┐   GET /api/v1/route   ┌───────┴──────────┐   GET /api/v1/route   ┌─────────────┐
│  Client   │ ──────────────────▶  │  Context Service  │ ──────────────────▶  │  Uniform     │
│           │  + visitor-id header  │  (Next.js)        │  + x-api-key         │  Canvas API  │
│           │ ◀──────────────────  │                   │ ◀──────────────────  │              │
│           │  resolved composition │                   │  raw composition     │              │
└──────────┘                       └───────────────────┘                      └─────────────┘
```

### Request flow

1. Client sends `GET /api/v1/route?path=/some-page` with an optional `visitor-id` header.
2. If `visitor-id` is present, the service fetches the visitor's CDP profile from `https://cdpmock.vercel.app/api/profiles/{visitorId}` and builds **quirks**:
   - `audience` — the visitor's audience segment
   - `geoAudience` — geographic proximity
   - `hasReservation` — `"true"` or `"false"` based on a reservation record
3. The service calls the **Uniform Route API** at `https://uniform.global/api/v1/route` with the `path`, `projectId`, `state=0`, and `x-api-key` authentication.
4. If the response is a **composition**, the service walks the composition tree and:
   - **Personalization nodes** — resolves variations via `context.personalize()`, filters by date range, replaces/removes nodes
   - **A/B test nodes** — resolves via `context.test()`, filters by date range, replaces/removes nodes
   - **Regular nodes** — removes if outside their date-range window
5. Returns the fully processed composition JSON to the client.

---

## Project structure

```
nextjs-api/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── v1/
│   │           └── route/
│   │               └── route.ts          ← (A) Node.js API route handler
│   ├── lib/
│   │   ├── context-service.ts            ← Shared core logic
│   │   └── context-manifest.json         ← Uniform Context manifest
│   └── middleware.ts                     ← (B) Vercel Edge middleware
├── .env.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

### Key files

**`src/lib/context-service.ts`** — The shared core module. Contains all business logic extracted from the original Cloudflare Worker, organized as composable functions:

| Function | Purpose |
|----------|---------|
| `buildQuirks(visitorId)` | Fetches CDP profile, returns quirks map |
| `fetchComposition(path, projectId, apiKey)` | Calls Uniform Route API |
| `processComposition({ composition, quirks })` | Walks the tree: resolves personalization, A/B tests, date windows |
| `isWithinDateRange(node)` | Checks component start/end date parameters |
| `handleContextRequest(path, visitorId, projectId, apiKey)` | Full orchestrator — calls the above in sequence, returns a `Response` |

**`src/app/api/v1/route/route.ts`** — Mode A. A standard Next.js App Router GET handler using the Node.js runtime. Reads environment variables from `process.env`, delegates to `handleContextRequest`.

**`src/middleware.ts`** — Mode B. A Next.js middleware that intercepts `/api/v1/route` requests at the edge. Gated behind `ENABLE_EDGE_MIDDLEWARE=true`.

---

## Setup

### 1. Install dependencies

```bash
cd nextjs-api
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your Uniform credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
UNIFORM_API_KEY=your-uniform-api-key
UNIFORM_PROJECT_ID=your-uniform-project-id

# Only set this to "true" when deploying to Vercel and wanting edge middleware
ENABLE_EDGE_MIDDLEWARE=false
```

### 3. Update the context manifest (optional)

The included `context-manifest.json` is a minimal default. To download the latest manifest from your Uniform project:

```bash
npm run uniform:manifest
```

This requires the `@uniformdev/cli` to be installed and authenticated.

### 4. Run the dev server

```bash
npm run dev
```

The API is available at `http://localhost:3000/api/v1/route?path=/`.

---

## API reference

### `GET /api/v1/route`

Fetches and resolves a Uniform Canvas composition for a given page path.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | The page path to resolve (e.g. `/`, `/about`) |

**Request headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `visitor-id` | No | Visitor identifier for CDP profile lookup and personalized quirks |

**Response:**

- `200` — Resolved composition JSON (same shape as Uniform's Route API, with personalization/tests pre-resolved)
- `400` — Upstream Uniform API returned an error
- `500` — Missing environment variables

**Example:**

```bash
curl "http://localhost:3000/api/v1/route?path=/" \
  -H "visitor-id: 123"
```

---

## Mode A — Node.js API Route (self-hosted)

This is the **default mode**. The API route at `src/app/api/v1/route/route.ts` handles all requests using the standard Node.js runtime.

**When to use:** Any self-hosted Next.js deployment — Azure App Service, Docker containers, AWS EC2/ECS, DigitalOcean, bare metal, etc.

**How it works:** The Next.js App Router maps `GET /api/v1/route` to the `GET` export in `route.ts`. It runs as a regular serverless/server function with full Node.js API access.

**No extra configuration needed** — this mode works out of the box with just the Uniform environment variables.

---

## Mode B — Vercel Edge Middleware

This mode runs the context resolution at the **Vercel Edge Network**, closer to the user, for lower latency.

**When to use:** Vercel deployments where you want edge-level personalization.

**How to enable:**

Set `ENABLE_EDGE_MIDDLEWARE=true` in your Vercel project's environment variables (or in `.env.local` for local development).

**How it works:** The middleware at `src/middleware.ts` intercepts requests matching `/api/v1/route` *before* they reach the API route. When enabled, it handles the request entirely at the edge and returns the response directly. When disabled, it calls `NextResponse.next()` and the request falls through to Mode A's API route.

**Coexistence:** Both the middleware file and the API route exist simultaneously. The toggle mechanism ensures only one handles the request:

```
Request → /api/v1/route
  │
  ├─ ENABLE_EDGE_MIDDLEWARE=true  → Middleware handles it (edge)
  │
  └─ ENABLE_EDGE_MIDDLEWARE=false → Middleware passes through → API route handles it (Node.js)
```

> **Note:** The `@uniformdev/canvas` and `@uniformdev/context` packages must be compatible with the Edge Runtime for Mode B to work. If you encounter Edge Runtime compatibility issues, keep `ENABLE_EDGE_MIDDLEWARE=false` and use Mode A.

---

## Comparison with the Cloudflare Worker

This project is a faithful port of the [Cloudflare Worker](../cloudflare-worker/) implementation. The core personalization logic — `processComposition`, `isWithinDateRange`, quirks building, and Uniform API interaction — is identical.

| Aspect | Cloudflare Worker | Next.js API Route (A) | Vercel Edge Middleware (B) |
|--------|-------------------|----------------------|---------------------------|
| Runtime | Cloudflare Workers (V8) | Node.js | Vercel Edge (V8) |
| Entry point | `src/index.ts` default export | `src/app/api/v1/route/route.ts` | `src/middleware.ts` |
| Auth to Uniform | `env.UNIFORM_API_KEY` | `process.env.UNIFORM_API_KEY` | `process.env.UNIFORM_API_KEY` |
| Deploy target | Cloudflare | Any Node.js host | Vercel |
| Edge execution | Yes (Cloudflare edge) | No (origin server) | Yes (Vercel edge) |
| Cold start | ~0ms (V8 isolate) | Typical Node.js cold start | ~0ms (V8 isolate) |

### Architecture changes from the Cloudflare Worker

1. **Shared library extraction** — The worker's monolithic `index.ts` is split into a reusable `context-service.ts` module that both execution modes import.
2. **Explicit `GET` method** — Instead of handling all HTTP methods via a generic `fetch` handler, the API route explicitly exports a `GET` function.
3. **Simplified Uniform API call** — The worker spread the entire incoming `request` object into the Uniform fetch call (including method, body, headers). The Next.js version uses a clean `GET` with only the required `x-api-key` header, avoiding unintended header forwarding.
4. **Fallback for non-composition responses** — The worker had a missing `return` for responses that were `ok` but not of type `composition`. The Next.js version returns the upstream data as-is in that case.
5. **Toggle mechanism** — An `ENABLE_EDGE_MIDDLEWARE` environment variable lets you choose between edge and origin execution without modifying code.

---

## Testing with the console client

The [console-client](../console-client/) can be used to test this service. Update its fetch URL to point at the Next.js dev server:

```javascript
const response = await fetch(
  "http://localhost:3000/api/v1/route?path=/",
  {
    headers: {
      "visitor-id": "123",
    },
  }
);
```

---

## Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNIFORM_API_KEY` | Yes | — | API key for authenticating with the Uniform Canvas Route API |
| `UNIFORM_PROJECT_ID` | Yes | — | Uniform project identifier |
| `ENABLE_EDGE_MIDDLEWARE` | No | `false` | Set to `"true"` to enable Vercel Edge Middleware mode |

---

## Deployment

### Self-hosted (Mode A)

Deploy as any standard Next.js application. Set `UNIFORM_API_KEY` and `UNIFORM_PROJECT_ID` as environment variables in your hosting platform. Leave `ENABLE_EDGE_MIDDLEWARE` unset or set to `false`.

```bash
npm run build
npm start
```

### Vercel (Mode B)

1. Push to a Git repository connected to Vercel.
2. In your Vercel project settings, add all three environment variables.
3. Set `ENABLE_EDGE_MIDDLEWARE=true` to activate edge execution.
4. Deploy.

Both modes can also be used on Vercel — if you prefer the API route (Mode A) on Vercel, simply leave `ENABLE_EDGE_MIDDLEWARE=false` and requests will be handled by the serverless function instead of the edge middleware.
