import { type RootComponentInstance } from "@uniformdev/canvas";
import { type ManifestV2 } from "@uniformdev/context";
import { processComposition } from "@uniformdev/context-engine";
export { processComposition };
import manifest from "./context-manifest.json";
import { NextResponse } from "next/server";

const CDP_PROFILE_BASE_URL = new URL("/api/profiles", process.env.PROFILE_SERVICE_URL || "https://cdpmock.vercel.app").toString();
const UNIFORM_ROUTE_API_BASE = new URL("/api/v1/route", process.env.UNIFORM_CLI_BASE_EDGE_URL || "https://uniform.global").toString();

interface Profile {
  audience: string;
  geoProximity: string;
  reservation: { confirmationNumber: string } | null;
  membershipStatus: string;
}

/**
 * Fetches a visitor profile from the CDP mock and builds quirks
 * that drive Uniform Context personalization decisions.
 */
export async function buildQuirks(
  visitorId: string | null,
  cdpBaseUrl = CDP_PROFILE_BASE_URL,
): Promise<Record<string, string>> {
  const quirks: Record<string, string> = {};

  if (!visitorId) {
    return quirks;
  }

  const profileRes = await fetch(`${cdpBaseUrl}/${visitorId}`);
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as Profile;

    Object.assign(quirks, {
      ...(profile.audience && { audience: profile.audience }),
      ...(profile.geoProximity && { geoAudience: profile.geoProximity }),
      hasReservation: profile.reservation?.confirmationNumber ? "true" : "false",
    });
  }

  return quirks;
}

/**
 * Calls the Uniform Route API for a given path and returns the raw response.
 */
export async function fetchComposition(
  searchParams: URLSearchParams,
  projectId: string,
  apiKey: string
): Promise<Response> {
  const params = new URLSearchParams(searchParams);
  params.set("projectId", projectId);
  if (!params.has("state")) {
    params.set("state", "0");
  }

  const response = await fetch(`${UNIFORM_ROUTE_API_BASE}?${params.toString()}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  });

  return response;
}

/**
 * Full request handler: orchestrates quirks lookup, Uniform API call,
 * and composition processing. Returns a Response ready to send to the client.
 */
export async function handleContextRequest(
  searchParams: URLSearchParams,
  visitorId: string | null,
): Promise<Response> {
  const projectId = process.env.UNIFORM_PROJECT_ID;
  const apiKey = process.env.UNIFORM_API_KEY;

  if (!projectId || !apiKey) {
    return NextResponse.json(
      { error: "Missing Uniform connection details" },
      { status: 400 }
    );
  }

  const quirks = await buildQuirks(visitorId);

  const response = await fetchComposition(searchParams, projectId, apiKey);

  if (!response.ok) {
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (data?.type === "composition") {
    const compositionResponse = data.compositionApiResponse as Record<
      string,
      unknown
    >;
    const composition =
      compositionResponse?.composition as RootComponentInstance;

    await processComposition({
      composition,
      quirks,
      manifest: manifest as ManifestV2,
    });
  }

  const upstreamHeaders = new Headers(response.headers);
  upstreamHeaders.set("Content-Type", "application/json");

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: upstreamHeaders,
  });
}
