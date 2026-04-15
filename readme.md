# Uniform Context as a Service

Server-side personalization powered by [Uniform](https://uniform.dev). This project moves personalization logic out of the frontend and into a lightweight server/edge function that acts as a proxy, resolving personalized content variants and A/B tests before the response reaches the client.

This pattern is recommended for **mobile apps**, **non-JavaScript runtimes**, and any architecture where client-side personalization is undesirable (layout shifts, SDK bundle size, flicker).

## How it works

```
                                +-----------------------+
                                |  Mock Profile Service |
                                |  (visitor profiles)   |
                                +----------+------------+
                                           |
Client --- visitor-id ---> Context Service -+---> Uniform Route API
                                |                    |
                                v                    v
                          Context Engine         Raw composition
                        (personalize + test)
                                |
                                v
                        Resolved composition ---> Client
```

1. The client sends a request with an optional `visitor-id` header (or quirks via other means depending on the specific proxy used).
2. The service looks up the visitor's profile to build **quirks** -- key-value pairs like `audience`, `geoAudience`, and `hasReservation`.
3. It fetches the page composition from Uniform's Route API.
4. Using the **context manifest** and the visitor's quirks, it walks the composition tree and:
   - Resolves **personalization** nodes to the best-matching variant
   - Picks an **A/B test** variant
   - Strips resolution metadata (`$pzCrit`, `$tstVrnt`, `pz`, `control`, `id`) from the output
5. Returns the fully resolved, clean composition as JSON.

## Repository structure

```
context-as-a-service/
|
+-- nextjs-api/              Next.js implementation (API route + Vercel Edge middleware)
+-- cloudflare-worker/       Cloudflare Workers implementation
+-- akamai-edgeworker/       Akamai EdgeWorkers implementation
+-- mock-profile-service/    Mock CDP/profile API for demo visitor data
+-- console-client/          Minimal Node.js client for smoke-testing
+-- readme.md                This file
```

Each proxy implements the same core logic -- fetching a composition, evaluating personalization and A/B tests via `@uniformdev/context` and `@uniformdev/canvas`, and returning a clean resolved response. The differences are in runtime APIs, deployment tooling, and how environment variables and headers are accessed.

## Proxy implementations

### [Next.js (`nextjs-api/`)](nextjs-api/)

Two execution modes in a single Next.js app:

- **API Route** (Node.js runtime) -- for self-hosted deployments on Azure, Docker, AWS, etc.
- **Vercel Edge Middleware** -- for edge execution on Vercel, toggled via `ENABLE_EDGE_MIDDLEWARE=true`

Includes a comprehensive Vitest test suite with 34 tests covering personalization, A/B testing, quirks building, metadata stripping, and full integration tests.

**Start here** -- this is the most complete and well-tested implementation.

See [`nextjs-api/README.md`](nextjs-api/README.md) for full documentation.

### [Cloudflare Workers (`cloudflare-worker/`)](cloudflare-worker/)

A single-file Cloudflare Worker using Wrangler for local dev and deployment. Lightweight, runs on Cloudflare's global edge network.

See [`cloudflare-worker/README.md`](cloudflare-worker/README.md) for full documentation.

### [Akamai EdgeWorkers (`akamai-edgeworker/`)](akamai-edgeworker/)

An Akamai EdgeWorker using `httpRequest` and `createResponse` APIs, bundled with Rollup. Supports Akamai's sandbox environment for local testing and the Akamai CLI for deployment.

This proxy also demonstrates **cookie-based transition data** via `CookieTransitionDataStore` for persistent visitor context across requests, and **header-based quirks** (`x-quirk-*` headers) as an alternative to CDP profile lookup.

See [`akamai-edgeworker/README.md`](akamai-edgeworker/README.md) for full documentation.

## Supporting services

### [Mock Profile Service (`mock-profile-service/`)](mock-profile-service/)

A Next.js app that serves as a **mock CDP (Customer Data Platform)** for demos. It provides a REST API at `/api/profiles/{id}` that returns visitor profile data including audience segment, geographic proximity, reservation status, and membership level.

The profile data drives the **quirks** that the context service uses for personalization decisions. In production, this would be replaced by a real CDP, CRM, or identity service.

See [`mock-profile-service/README.md`](mock-profile-service/README.md) for the profile data schema and available test visitors.

### [Console Client (`console-client/`)](console-client/)

A minimal Node.js script for smoke-testing any of the proxy services. It sends a request with a `visitor-id` header and logs the resolved page title from the composition response.

See [`console-client/README.md`](console-client/README.md) for usage.

## Shared API contract

All proxies expose the same API:

### `GET /api/v1/route?path=<page-path>`

Proxies to Uniform's Route API with server-side personalization applied. All query parameters are passed through to the Uniform API.

**Headers:**

| Header       | Required | Description                           |
|--------------|----------|---------------------------------------|
| `visitor-id` | No       | Visitor identifier for profile lookup |

**Response:** The full Uniform route response with personalization and test nodes resolved inline, and SDK metadata stripped.

**Example:**

```bash
curl "http://localhost:3000/api/v1/route?path=/" \
  -H "visitor-id: 123"
```

## Prerequisites

- Node.js 18+
- A [Uniform](https://uniform.dev) project with Canvas compositions
- Platform-specific CLI tools (Wrangler for Cloudflare, Akamai CLI for EdgeWorkers, etc.)

## Environment variables

All proxies require:

| Variable                   | Required | Description                                      |
|----------------------------|----------|--------------------------------------------------|
| `UNIFORM_API_KEY`          | Yes      | API key for the Uniform Canvas Route API         |
| `UNIFORM_PROJECT_ID`       | Yes      | Uniform project identifier                       |
| `UNIFORM_CLI_BASE_EDGE_URL`| No      | Override Uniform API base URL (default: `https://uniform.global`) |
| `PROFILE_SERVICE_URL`      | No      | Override mock profile service URL (default: `https://cdpmock.vercel.app`) |

Additional proxy-specific variables are documented in each proxy's README.

## Tech stack

- **Personalization:** [Uniform Context](https://docs.uniform.app/docs/context) + [Canvas](https://docs.uniform.app/docs/canvas) (`@uniformdev/context`, `@uniformdev/canvas`)
- **Language:** TypeScript
- **Runtimes:** Node.js, Cloudflare Workers (V8), Akamai EdgeWorkers, Vercel Edge
