# Context as a Service -- Akamai EdgeWorkers

An Akamai EdgeWorker that provides server-side Uniform Context personalization at the Akamai edge. Uses `httpRequest` and `createResponse` APIs, bundled with Rollup for deployment.

## Key differences from other wrappers

- **Header-based quirks** -- reads `x-quirk-*` headers from the incoming request instead of (or in addition to) a CDP profile lookup. This allows the CDN or origin to inject quirks upstream.
- **Cookie-based transition data** -- uses `CookieTransitionDataStore` with `ufvd` and `ufvdqk` cookies for persistent visitor context across requests.
- **Akamai property variables** -- reads `PMUSER_UNIFORM_PROJECTID` and `PMUSER_UNIFORM_API_KEY` from Akamai property manager variables instead of environment variables.
- **Rollup bundle** -- EdgeWorkers require a single bundled JS file with a `bundle.json` manifest, built via Rollup.

## How it works

The `responseProvider` handler:

1. Reads Uniform credentials from Akamai property variables.
2. Extracts quirks from `x-quirk-*` request headers and transition data from `ufvd`/`ufvdqk` cookies.
3. Forwards the request to Uniform's Route API via `httpRequest`.
4. Resolves personalization and A/B test nodes in the composition tree.
5. Strips SDK metadata (`$pzCrit`, `$tstVrnt`, `pz`, `control`, `id`) from resolved nodes.
6. Returns the processed composition via `createResponse`.

## Project structure

```
akamai-edgeworker/
+-- src/
|   +-- main.ts                 EdgeWorker entry point
|   +-- bundle.json             Akamai bundle manifest
|   +-- context-manifest.json   Uniform Context manifest
+-- tests/                      Jest tests
+-- rollup.config.js            Rollup bundle config
+-- .env.example                Local env vars for Akamai CLI
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
```

Fill in your Akamai EdgeWorker settings:

```env
EW_ID=your-edgeworker-id
NETWORK=production
SANDBOX_HOSTNAME=your-sandbox-hostname
SANDBOX_NAME=your-sandbox-name
```

Uniform credentials (`PMUSER_UNIFORM_API_KEY`, `PMUSER_UNIFORM_PROJECTID`) are configured in Akamai Property Manager, not in this env file.

### 3. Download the context manifest

```bash
npm run uniform:manifest
```

### 4. Build

```bash
npm run build
```

Outputs bundled files to `dist/`.

## Deployment

### Sandbox (development)

Create a sandbox and deploy:

```bash
npm run s:create      # create sandbox
npm run s:deploy      # build + deploy to sandbox
npm run s:start       # start sandbox with logs
```

### Production

```bash
npm run build
npm run akamai:deploy
npm run akamai:activate
```

## Testing

```bash
npm test              # single run
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

## Environment variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `EW_ID` | `80886` | Akamai EdgeWorker ID |
| `NETWORK` | `production` | Target network for activation |
| `VERSION` | `3.1.3` | EdgeWorker version |
| `SANDBOX_HOSTNAME` | -- | Sandbox hostname |
| `SANDBOX_NAME` | -- | Sandbox environment name |

## Akamai property variables

Configured in Akamai Property Manager:

| Variable | Description |
|----------|-------------|
| `PMUSER_UNIFORM_PROJECTID` | Uniform project identifier |
| `PMUSER_UNIFORM_API_KEY` | Uniform Canvas Route API key |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Clean + bundle with Rollup |
| `npm test` | Run Jest tests |
| `npm run uniform:manifest` | Download context manifest |
| `npm run akamai:deploy` | Upload to Akamai EdgeWorkers |
| `npm run akamai:activate` | Activate on production |
| `npm run s:deploy` | Build + deploy to sandbox |
| `npm run s:start` | Start sandbox with logs |
| `npm run s:create` | Create a new sandbox |
