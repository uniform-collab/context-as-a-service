import {
  CANVAS_PERSONALIZE_SLOT,
  CANVAS_PERSONALIZE_TYPE,
  CANVAS_TEST_TYPE,
  CANVAS_TEST_SLOT,
  ComponentParameter,
  RootComponentInstance,
  mapSlotToPersonalizedVariations,
  mapSlotToTestVariations,
  walkNodeTree,
} from "@uniformdev/canvas";
import { Context, ManifestV2 } from "@uniformdev/context";
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
  visitorId: string | null
): Promise<Record<string, string>> {
  const quirks: Record<string, string> = {};

  if (!visitorId) {
    return quirks;
  }

  const profileRes = await fetch(`${CDP_PROFILE_BASE_URL}/${visitorId}`);
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
 * Walks a Uniform composition tree and resolves personalization
 * and A/B tests in-place.
 */
export async function processComposition({
  composition,
  quirks,
}: {
  composition: RootComponentInstance;
  quirks: Record<string, string>;
}): Promise<void> {
  const context = new Context({
    manifest: manifest as ManifestV2,
    defaultConsent: true,
    requireConsentForPersonalization: false,
  });

  await context.update({ quirks });

  walkNodeTree(composition, async (treeNode) => {
    if (treeNode.type === "component") {
      const { node, actions } = treeNode;

      if (node.type === CANVAS_PERSONALIZE_TYPE) {
        const slot = node.slots?.[CANVAS_PERSONALIZE_SLOT];
        const trackingEventName = node.parameters?.[
          "trackingEventName"
        ] as ComponentParameter<string>;
        const count = node.parameters?.["count"] as ComponentParameter<
          number | string
        >;

        let parsedCount: number | undefined;
        if (typeof count === "string") {
          parsedCount = parseInt(count, 10);
        } else if (typeof count !== "number") {
          parsedCount = undefined;
        } else {
          parsedCount = count || 1;
        }

        const mapped = mapSlotToPersonalizedVariations(slot);
        const { variations } = context.personalize({
          name: trackingEventName.value ?? "Untitled Personalization",
          variations: mapped,
          take: parsedCount,
        });

        if (!variations || variations.length === 0) {
          actions.remove();
        } else {
          const [first, ...rest] = variations;

          if (first) {
            actions.replace(first);
          }
          if (rest.length) {
            actions.insertAfter(rest);
          }
        }
      } else if (node.type === CANVAS_TEST_TYPE) {
        const slot = node.slots?.[CANVAS_TEST_SLOT];
        const testName = node.parameters?.["test"] as ComponentParameter<
          string | undefined
        >;
        const mapped = mapSlotToTestVariations(slot);

        const { result } = context.test({
          name: testName.value ?? "Untitled Test",
          variations: mapped,
        });

        if (!result) {
          actions.remove();
        } else {
          actions.replace(result);
        }
      }
    }
  });

  stripResolvedMetadata(composition);
}

const METADATA_PARAMS = ["$pzCrit", "$tstVrnt"];
const METADATA_TOP_LEVEL = ["pz", "control", "id"];

/**
 * Strips Uniform SDK resolution metadata from all nodes so the
 * response only contains clean component data.
 */
function stripResolvedMetadata(node: Record<string, unknown>): void {
  if (node.parameters && typeof node.parameters === "object") {
    const params = node.parameters as Record<string, unknown>;
    for (const key of METADATA_PARAMS) {
      delete params[key];
    }
  }

  for (const key of METADATA_TOP_LEVEL) {
    delete node[key];
  }

  if (node.slots && typeof node.slots === "object") {
    const slots = node.slots as Record<string, unknown[]>;
    for (const slotChildren of Object.values(slots)) {
      if (Array.isArray(slotChildren)) {
        for (const child of slotChildren) {
          if (child && typeof child === "object") {
            stripResolvedMetadata(child as Record<string, unknown>);
          }
        }
      }
    }
  }
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

    await processComposition({ composition, quirks });
  }

  const upstreamHeaders = new Headers(response.headers);
  upstreamHeaders.set("Content-Type", "application/json");

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: upstreamHeaders,
  });
}
