import { type RootComponentInstance } from "@uniformdev/canvas";
import { type ManifestV2 } from "@uniformdev/context";
import { processComposition } from "@uniformdev/context-engine";
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

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const cdpBaseUrl = new URL("/api/profiles", env.PROFILE_SERVICE_URL || "https://cdpmock.vercel.app").toString();
		const uniformBaseUrl = new URL("/api/v1/route", env.UNIFORM_CLI_BASE_EDGE_URL || "https://uniform.global").toString();

		const incomingUrl = new URL(request.url);
		const visitorId = request.headers.get('visitor-id');
		const quirks = await buildQuirks(visitorId, cdpBaseUrl);

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
			await processComposition({
				composition,
				quirks,
				manifest: manifest as ManifestV2,
			});
		}

		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: response.headers,
		});
	},
} satisfies ExportedHandler<Env>;
