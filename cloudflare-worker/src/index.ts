import { CANVAS_PERSONALIZE_SLOT, CANVAS_PERSONALIZE_TYPE, CANVAS_TEST_TYPE, CANVAS_TEST_SLOT, ComponentParameter, RootComponentInstance, mapSlotToPersonalizedVariations, mapSlotToTestVariations, walkNodeTree } from "@uniformdev/canvas";
import { Context, ManifestV2 } from "@uniformdev/context";
import manifest from './context-manifest.json';

interface Env {
	UNIFORM_API_KEY: string;
	UNIFORM_PROJECT_ID: string;
	UNIFORM_CLI_BASE_EDGE_URL?: string;
	PROFILE_SERVICE_URL?: string;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const cdpBaseUrl = new URL("/api/profiles", env.PROFILE_SERVICE_URL || "https://cdpmock.vercel.app").toString();
		const uniformBaseUrl = new URL("/api/v1/route", env.UNIFORM_CLI_BASE_EDGE_URL || "https://uniform.global").toString();

		const incomingUrl = new URL(request.url);
		const visitorId = request.headers.get('visitor-id');

		// Build quirks from CDP profile
		const quirks: Record<string, string> = {};
		if (visitorId) {
			const profileRes = await fetch(`${cdpBaseUrl}/${visitorId}`);
			if (profileRes.ok) {
				const profile = (await profileRes.json()) as {
					audience: string;
					geoProximity: string;
					reservation: { confirmationNumber: string } | null;
					membershipStatus: string;
				};

				Object.assign(quirks, {
					...(profile.audience && { audience: profile.audience }),
					...(profile.geoProximity && { geoAudience: profile.geoProximity }),
					hasReservation: profile.reservation?.confirmationNumber ? "true" : "false",
				});
			}
		}

		// Pass through all incoming query params, ensure projectId and state
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

		const data = (await response.json()) as any;
		if (data?.type === "composition") {
			const composition = data?.compositionApiResponse?.composition;
			await processComposition({ composition, quirks });
		}

		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: response.headers,
		});
	},
} satisfies ExportedHandler<Env>;

const METADATA_PARAMS = ["$pzCrit", "$tstVrnt"];
const METADATA_TOP_LEVEL = ["pz", "control", "id"];

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

const processComposition = async ({
	composition,
	quirks,
}: {
	composition: RootComponentInstance;
	quirks: Record<string, string>;
}) => {
	const context = new Context({
		manifest: manifest as ManifestV2,
		defaultConsent: true,
		requireConsentForPersonalization: false,
	});

	await context.update({ quirks });

	walkNodeTree(composition, async (treeNode) => {
		if (treeNode.type === 'component') {
			const { node, actions } = treeNode;

			if (node.type === CANVAS_PERSONALIZE_TYPE) {
				const slot = node.slots?.[CANVAS_PERSONALIZE_SLOT];
				const trackingEventName = node.parameters?.['trackingEventName'] as ComponentParameter<string>;
				const count = node.parameters?.['count'] as ComponentParameter<number | string>;

				let parsedCount: number | undefined;
				if (typeof count === 'string') {
					parsedCount = parseInt(count, 10);
				} else if (typeof count !== 'number') {
					parsedCount = undefined;
				} else {
					parsedCount = count || 1;
				}

				const mapped = mapSlotToPersonalizedVariations(slot);
				const { variations } = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
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
				const testName = node.parameters?.['test'] as ComponentParameter<string | undefined>;
				const mapped = mapSlotToTestVariations(slot);

				const { result } = context.test({
					name: testName.value ?? 'Untitled Test',
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
