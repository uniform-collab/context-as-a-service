# Context as a Service -- Next.js

Server-side Uniform Context personalization as a Next.js Backend-for-Frontend (BFF). Ships two interchangeable execution modes inside a single app:

| Mode | Runtime | Target environment |
|------|---------|-------------------|
| **A -- API Route** | Node.js | Self-hosted Next.js (Azure, Docker, AWS, etc.) |
| **B -- Edge Middleware** | Vercel Edge | Vercel deployments |

Both expose the same API contract -- `GET /api/v1/route?path=<page-path>` -- and produce identical output.

## How it works

The service is a transparent proxy between your frontend and the Uniform Canvas Route API. Before returning the composition to the client, it resolves personalization, A/B tests, and strips SDK metadata so the browser receives a clean, fully processed composition.

```
                                +-----------------------+
                                |  Mock Profile Service |
                                |  (visitor profiles)   |
                                +----------+------------+
                                           |
Client --- GET /api/v1/route ---> Next.js -+---> Uniform Route API
             + visitor-id          |                   |
                                   v                   v
                             Context Engine       Raw composition
                           (personalize + test)
                                   |
                                   v
                           Resolved composition ---> Client
```

### Request flow

1. Client sends `GET /api/v1/route?path=/some-page` with an optional `visitor-id` header.
2. If `visitor-id` is present, the service fetches the visitor's profile from the mock CDP and builds **quirks** (`audience`, `geoAudience`, `hasReservation`).
3. All incoming query parameters are forwarded to the Uniform Route API along with `projectId` and `x-api-key` authentication.
4. If the response is a composition, the service walks the tree and:
   - Resolves **personalization** nodes to the best-matching variant
   - Picks an **A/B test** variant
   - Strips resolution metadata (`$pzCrit`, `$tstVrnt`, `pz`, `control`, `id`)
5. Returns the resolved composition with original upstream headers preserved.

## Project structure

```
nextjs-api/
+-- src/
|   +-- app/
|   |   +-- api/v1/route/
|   |       +-- route.ts              (A) Node.js API route handler
|   +-- lib/
|   |   +-- context-service.ts        Shared core logic
|   |   +-- context-manifest.json     Uniform Context manifest
|   +-- middleware.ts                 (B) Vercel Edge middleware
+-- tests/
|   +-- fixtures/
|   |   +-- home-composition.json     Stored composition for tests
|   +-- context-service.test.ts       34 tests (Vitest)
+-- .env.example
+-- vitest.config.ts
+-- package.json
```

### Key modules

**`src/lib/context-service.ts`** -- Shared core. All business logic organized as composable functions:

| Function | Purpose |
|----------|---------|
| `buildQuirks(visitorId)` | Fetches CDP profile, returns quirks map |
| `fetchComposition(searchParams, projectId, apiKey)` | Calls Uniform Route API, forwards all query params |
| `processComposition({ composition, quirks })` | Walks the tree: resolves personalization and A/B tests |
| `stripResolvedMetadata(node)` | Recursively removes SDK metadata from resolved nodes |
| `handleContextRequest(searchParams, visitorId)` | Full orchestrator -- calls the above in sequence |

**`src/app/api/v1/route/route.ts`** -- Mode A. Standard Next.js App Router GET handler, Node.js runtime.

**`src/middleware.ts`** -- Mode B. Intercepts `/api/v1/route` at the edge, gated behind `ENABLE_EDGE_MIDDLEWARE=true`.

## Setup

### 1. Install dependencies

```bash
cd nextjs-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

```env
UNIFORM_API_KEY=your-uniform-api-key
UNIFORM_PROJECT_ID=your-uniform-project-id
ENABLE_EDGE_MIDDLEWARE=false
```

### 3. Update the context manifest (optional)

```bash
npm run uniform:manifest
```

Requires `@uniformdev/cli` installed and authenticated.

### 4. Run the dev server

```bash
npm run dev
```

API available at `http://localhost:3000/api/v1/route?path=/`.

## Testing

The project includes 34 Vitest tests covering:

- **Audience personalization** -- all 5 audience segments + default fallback
- **Reservation personalization** -- has/no reservation + absent quirk
- **A/B test resolution** -- resolves to Control or Variant
- **Structural integrity** -- no wrapper nodes remain, all resolved nodes are hero components
- **Metadata cleanup** -- `$pzCrit`, `$tstVrnt`, `pz`, `control`, `id` stripped
- **Combined profile scenarios** -- 6 real profile shapes (Marcus Chen, Priya Patel, etc.)
- **buildQuirks** -- null visitor, CDP errors, field mapping
- **handleContextRequest integration** -- full pipeline with mocked fetch, error passthrough

```bash
npm test            # single run
npm run test:watch  # watch mode
```

## API reference

### `GET /api/v1/route`

Fetches and resolves a Uniform Canvas composition. All query parameters are forwarded to the Uniform API.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Page path to resolve (e.g. `/`, `/about`) |

**Request headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `visitor-id` | No | Visitor identifier for profile lookup |

**Response:** Resolved composition JSON with upstream status and headers preserved. On error, the upstream response body and status are passed through unchanged.

## Mode A -- Node.js API Route (self-hosted)

Default mode. Works on any self-hosted Next.js deployment (Azure App Service, Docker, AWS EC2/ECS, etc.). No extra configuration needed.

## Mode B -- Vercel Edge Middleware

Set `ENABLE_EDGE_MIDDLEWARE=true` to activate. The middleware intercepts `/api/v1/route` before it reaches the API route. When disabled, it calls `NextResponse.next()` and the request falls through to Mode A.

```
Request -> /api/v1/route
  |
  +- ENABLE_EDGE_MIDDLEWARE=true  -> Middleware handles it (edge)
  |
  +- ENABLE_EDGE_MIDDLEWARE=false -> Falls through -> API route (Node.js)
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNIFORM_API_KEY` | Yes | -- | Uniform Canvas Route API key |
| `UNIFORM_PROJECT_ID` | Yes | -- | Uniform project identifier |
| `UNIFORM_CLI_BASE_EDGE_URL` | No | `https://uniform.global` | Override Uniform API base URL |
| `PROFILE_SERVICE_URL` | No | `https://cdpmock.vercel.app` | Override mock profile service URL |
| `ENABLE_EDGE_MIDDLEWARE` | No | `false` | Set to `"true"` to enable edge middleware mode |

## Deployment

### Self-hosted (Mode A)

```bash
npm run build
npm start
```

Set `UNIFORM_API_KEY` and `UNIFORM_PROJECT_ID` in your hosting platform.

### Vercel (Mode B)

1. Connect your Git repository to Vercel.
2. Add environment variables in project settings.
3. Set `ENABLE_EDGE_MIDDLEWARE=true`.
4. Deploy.
