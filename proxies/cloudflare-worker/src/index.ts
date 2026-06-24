import { type RootComponentInstance } from "@uniformdev/canvas";
import { type ContextPlugin, type ManifestV2 } from "@uniformdev/context";
import { processComposition } from "@uniformdev/context-engine";
import manifest from './context-manifest.json';
import {
	collectSegmentIds,
	createCustomSegmentTargetingPlugin,
	fetchSegmentMemberships,
} from './customSegmentTargeting';

interface Env {
	UNIFORM_API_KEY: string;
	UNIFORM_PROJECT_ID: string;
	UNIFORM_CLI_BASE_EDGE_URL?: string;
	PROFILE_SERVICE_URL?: string;
	/** D1 database holding segment -> customer id membership. */
	DB?: D1Database;
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

const CUSTOMER_ID_HEADER = "x-customer-id";

/**
 * Builds the Context plugins for a composition. Currently registers the
 * custom-segment-targeting personalization algorithm, pre-loading the relevant
 * segment membership from D1 because the algorithm itself runs synchronously.
 */
async function buildContextPlugins(
	composition: RootComponentInstance,
	request: Request,
	env: Env,
): Promise<ContextPlugin[] | undefined> {
	if (!env.DB) {
		return undefined;
	}

	const segmentIds = collectSegmentIds(composition);
	if (segmentIds.length === 0) {
		return undefined;
	}

	try {
		const segments = await fetchSegmentMemberships(env.DB, segmentIds);
		const customerId = request.headers.get(CUSTOMER_ID_HEADER);
		return [createCustomSegmentTargetingPlugin({ customerId, segments })];
	} catch (error) {
		console.error("[custom-segment-targeting] failed to load segments from D1", error);
		return undefined;
	}
}

const QUIRK_HEADER_PREFIX = "x-quirk-";

function quirksFromHeaders(headers: Headers): Record<string, string> {
	const quirks: Record<string, string> = {};

	for (const [name, value] of headers.entries()) {
		if (name.startsWith(QUIRK_HEADER_PREFIX)) {
			const key = name.slice(QUIRK_HEADER_PREFIX.length);
			if (key) {
				quirks[key] = value;
			}
		}
	}

	return quirks;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const uniformBaseUrl = new URL("/api/v1/route", env.UNIFORM_CLI_BASE_EDGE_URL || "https://uniform.global").toString();
		const incomingUrl = new URL(request.url);

		const quirks = quirksFromHeaders(request.headers);

		const profileServiceUrl = parseUrl(env.PROFILE_SERVICE_URL);
		if (profileServiceUrl) {
			const cdpBaseUrl = new URL("/api/profiles", profileServiceUrl).toString();
			const visitorId = request.headers.get('visitor-id');
			Object.assign(quirks, await buildQuirks(visitorId, cdpBaseUrl));
		}
		const params = new URLSearchParams(incomingUrl.searchParams);
		params.set('projectId', env.UNIFORM_PROJECT_ID);

		const response = await fetch(`${uniformBaseUrl}?${params.toString()}`, {
			method: 'GET',
			headers: {
				'x-api-key': env.UNIFORM_API_KEY,
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
			const plugins = await buildContextPlugins(composition, request, env);
			await processComposition({
				composition,
				quirks,
				manifest: manifest as ManifestV2,
				contextOptions: plugins ? { plugins } : undefined,
			});
		}

		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: response.headers,
		});
	},
} satisfies ExportedHandler<Env>;
