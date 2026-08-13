import { type RootComponentInstance } from "@uniformdev/canvas";
import { type ManifestV2 } from "@uniformdev/context";
import { processComposition } from "@uniformdev/context-engine";
import {
	resolvePostVisitorBody,
	createCookieTransitionStore,
	quirksFromHeaders,
} from "./visitorPayload";
import manifest from './context-manifest.json';

interface Env {
	UNIFORM_API_KEY: string;
	UNIFORM_PROJECT_ID: string;
	UNIFORM_CLI_BASE_EDGE_URL?: string;
	PROFILE_SERVICE_URL?: string;
}

interface Profile {
	audience: string;
	geoProximity: string;
	reservation: { confirmationNumber: string } | null;
	membershipStatus: string;
}

async function buildQuirks(
	visitorId: string | null,
	cdpBaseUrl: string,
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

function parseUrl(value: string | undefined): URL | null {
	if (!value) {
		return null;
	}

	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const uniformBaseUrl = new URL("/api/v1/route", env.UNIFORM_CLI_BASE_EDGE_URL || "https://uniform.global").toString();
		const incomingUrl = new URL(request.url);

		const postResult = resolvePostVisitorBody(
			request.method,
			request.method === "POST" ? await request.text() : "",
		);
		if (!postResult.ok) {
			return jsonError(postResult.status, postResult.message);
		}

		const headerQuirks = quirksFromHeaders(request.headers);

		let quirks = { ...headerQuirks };
		let enrichments = undefined;
		let events = undefined;
		let transitionStore = undefined;
		let visitorSource: "client-body" | "cdp" | "headers" = Object.keys(headerQuirks).length
			? "headers"
			: "cdp";

		if (postResult.identity) {
			visitorSource = "client-body";
			quirks = postResult.identity.quirks;
			enrichments = postResult.identity.enrichments;
			events = postResult.identity.events;
			transitionStore = createCookieTransitionStore(postResult.identity);
		} else {
			const profileServiceUrl = parseUrl(env.PROFILE_SERVICE_URL);
			if (profileServiceUrl) {
				const cdpBaseUrl = new URL("/api/profiles", profileServiceUrl).toString();
				const visitorId = request.headers.get("visitor-id");
				Object.assign(quirks, await buildQuirks(visitorId, cdpBaseUrl));
				if (visitorId) {
					visitorSource = "cdp";
				}
			}
		}

		const params = new URLSearchParams(incomingUrl.searchParams);
		params.set("projectId", env.UNIFORM_PROJECT_ID);

		const response = await fetch(`${uniformBaseUrl}?${params.toString()}`, {
			method: "GET",
			headers: {
				"x-api-key": env.UNIFORM_API_KEY,
			},
		});

		if (!response.ok) {
			return new Response(response.body, {
				status: response.status,
				headers: response.headers,
			});
		}

		const data = (await response.json()) as Record<string, unknown>;
		if (data?.type === "composition") {
			const composition = (data as any)?.compositionApiResponse?.composition as RootComponentInstance;
			await processComposition({
				composition,
				quirks,
				enrichments,
				events,
				manifest: manifest as ManifestV2,
				contextOptions: transitionStore ? { transitionStore } : undefined,
			});
		}

		const headers = new Headers(response.headers);
		headers.set("Content-Type", "application/json");
		headers.set("x-uniform-visitor-source", visitorSource);

		return new Response(JSON.stringify(data), {
			status: response.status,
			headers,
		});
	},
} satisfies ExportedHandler<Env>;
