import { CANVAS_PERSONALIZE_SLOT, CANVAS_PERSONALIZE_TYPE, CANVAS_TEST_TYPE, ComponentParameter, RootComponentInstance, RouteGetResponse, RouteGetResponseComposition, mapSlotToPersonalizedVariations, mapSlotToTestVariations } from "@uniformdev/canvas";
import { Context, ManifestV2 } from "@uniformdev/context";
import manifest from './context-manifest.json';
import { walkNodeTree } from "@uniformdev/canvas";
import { CANVAS_TEST_SLOT } from "@uniformdev/canvas";

interface Env {
	UNIFORM_API_KEY: string;
	UNIFORM_PROJECT_ID: string;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		url.hostname = 'uniform.global';
		url.protocol = 'https:';
		url.port = '';
		url.searchParams.set('projectId', env.UNIFORM_PROJECT_ID);

		const quirks: Record<string, string> = {};
		const visitorId = request.headers.get('visitor-id');

		if (visitorId) {
			const profileRes = await fetch(`https://cdpmock.vercel.app/api/profiles/${visitorId}`);
			if (profileRes.ok) {
				const profile = (await profileRes.json()) as {
					audience: string;
					geoProximity: string;
					reservation: { confirmationNumber: string } | null;
					membershipStatus: string;
				};

				if (profile.audience) {
					quirks["audience"] = profile.audience;
				}
				if (profile.geoProximity) {
					quirks["geoAudience"] = profile.geoProximity;
				}
				quirks["hasReservation"] = profile.reservation?.confirmationNumber ? "true" : "false";
			}
		}

		console.log({ visitorId, quirks })

		const response = await fetch(`https://uniform.global/api/v1/route?path=${url.searchParams.get('path')}&projectId=${env.UNIFORM_PROJECT_ID}&state=0`, {
			...request,
			headers: {
				...request.headers,
				'x-api-key': env.UNIFORM_API_KEY,
			},
		});

		// is ok and json
		const isOk = response.ok;
		if (isOk) {
			const data = (await response.json()) as any;
			if (data?.type === "composition") {
				const composition = data?.compositionApiResponse?.composition;
				await processComposition({
					composition,
					quirks,
				});

				// console.log("processed", { data: composition?.slots.mainContent })
				return new Response(JSON.stringify(data), {
					status: response.status,
					headers: response.headers,
				});
				//}
			}
		} else {
			return new Response(JSON.stringify({ error: 'Invalid response' }), {
				status: 400,
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;


function isWithinDateRange(node: { parameters?: Record<string, ComponentParameter<unknown>> }): boolean {
	const startParam = node.parameters?.['start'] as ComponentParameter<{ datetime: string; timeZone: string }> | undefined;
	const endParam = node.parameters?.['end'] as ComponentParameter<{ datetime: string; timeZone: string }> | undefined;

	if (!startParam?.value && !endParam?.value) {
		return true;
	}

	const now = new Date();

	if (startParam?.value?.datetime && now < new Date(startParam.value.datetime)) {
		return false;
	}

	if (endParam?.value?.datetime && now > new Date(endParam.value.datetime)) {
		return false;
	}

	return true;
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

	await context.update({
		quirks,
	});

	walkNodeTree(composition, async (treeNode) => {
		if (treeNode.type === 'component') {
			const {
				node,
				actions,
			} = treeNode;

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
				const {
					variations
				} = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
					variations: mapped,
					take: parsedCount,
				});

				const dateFiltered = (variations ?? []).filter(v => isWithinDateRange(v));

				if (dateFiltered.length === 0) {
					actions.remove();
				} else {
					const [first, ...rest] = dateFiltered;

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

				const {
					result
				} = context.test({
					name: testName.value ?? 'Untitled Test',
					variations: mapped,
				});

				if (!result || !isWithinDateRange(result)) {
					actions.remove();
				} else {
					actions.replace(result);
				}
			} else if (!isWithinDateRange(node)) {
				actions.remove();
			}
		}
	});

}