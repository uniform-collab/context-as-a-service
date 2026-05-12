# Console Client

A minimal Node.js script for smoke-testing any of the Context as a Service wrappers. Sends a request with a `visitor-id` header and logs the resolved page title from the composition response.

## Usage

```bash
npm install
npm start
```

By default, it targets the Cloudflare Worker at `http://localhost:8787`. To test other wrappers, edit the URL in `index.mjs`:

```javascript
// Cloudflare Worker (default)
const response = await fetch("http://localhost:8787/api/v1/route?path=/", ...);

// Next.js
const response = await fetch("http://localhost:3000/api/v1/route?path=/", ...);
```

## What it does

1. Sends `GET /api/v1/route?path=/` with `visitor-id: 123`.
2. Parses the JSON response.
3. Logs the title of the first content slot component.

This verifies that the context service is running, resolving personalization, and returning clean composition data.
