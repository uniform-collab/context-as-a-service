import { type NextRequest } from "next/server";
import { handleContextRequest, quirksFromHeaderRecord } from "@/lib/context-service";

/**
 * Node.js runtime — works on any self-hosted Next.js deployment
 * (Azure App Service, Docker, AWS EC2, etc.)
 */
export const runtime = "nodejs";

function headerQuirks(request: NextRequest) {
  return quirksFromHeaderRecord(Object.fromEntries(request.headers.entries()));
}

export async function GET(request: NextRequest) {
  const visitorId = request.headers.get("visitor-id");
  return handleContextRequest(request.nextUrl.searchParams, visitorId, {
    method: "GET",
    headerQuirks: headerQuirks(request),
  });
}

export async function POST(request: NextRequest) {
  const visitorId = request.headers.get("visitor-id");
  return handleContextRequest(request.nextUrl.searchParams, visitorId, {
    method: "POST",
    bodyText: await request.text(),
    headerQuirks: headerQuirks(request),
  });
}
