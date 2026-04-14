import { type NextRequest } from "next/server";
import { handleContextRequest } from "@/lib/context-service";

/**
 * Node.js runtime — works on any self-hosted Next.js deployment
 * (Azure App Service, Docker, AWS EC2, etc.)
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const visitorId = request.headers.get("visitor-id");
  return handleContextRequest(request.nextUrl.searchParams, visitorId);
}
