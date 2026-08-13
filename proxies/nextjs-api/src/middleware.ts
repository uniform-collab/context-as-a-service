import { NextRequest, NextResponse } from "next/server";
import { handleContextRequest, quirksFromHeaderRecord } from "@/lib/context-service";

/**
 * Vercel Edge Middleware variant of the Context Service.
 *
 * Intercepts requests to /api/v1/route and resolves Uniform
 * compositions at the edge before they reach the Next.js server.
 *
 * Toggle: Set ENABLE_EDGE_MIDDLEWARE=true in your environment
 * to activate this middleware. When disabled, requests fall
 * through to the standard Node.js API route handler.
 */
export async function middleware(request: NextRequest) {
  if (process.env.ENABLE_EDGE_MIDDLEWARE !== "true") {
    return NextResponse.next();
  }

  const visitorId = request.headers.get("visitor-id");
  const method = request.method;
  const bodyText = method === "POST" ? await request.text() : "";

  return handleContextRequest(
    request.nextUrl.searchParams,
    visitorId,
    {
      method,
      bodyText,
      headerQuirks: quirksFromHeaderRecord(Object.fromEntries(request.headers.entries())),
    },
  );
}

export const config = {
  matcher: "/api/v1/route",
};
