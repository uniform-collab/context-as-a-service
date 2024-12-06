import { CANVAS_PERSONALIZE_SLOT, CANVAS_PERSONALIZE_TYPE, CANVAS_TEST_TYPE, ComponentParameter, RouteGetResponse, RouteGetResponseComposition, mapSlotToPersonalizedVariations, mapSlotToTestVariations } from "@uniformdev/canvas";
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

		request.headers.forEach((value, key) => {
			if (key.startsWith('x-quirk-')) {
				quirks[key.replace('x-quirk-', '')] = value;
			}
		});

		const response = await fetch(url.toString(), {
			...request,
			headers: {
				...request.headers,
				'x-api-key': env.UNIFORM_API_KEY,
			},
		});

		// is ok and json
		const isOk = response.ok && url.pathname.toLowerCase() === '/api/v1/route';

		if (isOk) {
			const route = await response.json() as RouteGetResponse;
			if (route.type === 'composition') {
				await processComposition({
					route,
					quirks,
				});

				return new Response(JSON.stringify(route), {
					status: response.status,
					headers: response.headers,
				});
			}
		}

		return response as any;
	},
} satisfies ExportedHandler<Env>;


const processComposition = async ({
	route,
	quirks,
}: {
	route: RouteGetResponseComposition;
	quirks: Record<string, string>;
}) => {
	const context = new Context({
		manifest: manifest as ManifestV2,
		defaultConsent: true,
		requireConsentForPersonalization: false,
	});

	console.log({ quirks })
	await context.update({
		quirks,
	});

	walkNodeTree(route.compositionApiResponse.composition, async (treeNode) => {
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
				console.log({ mapped })
				const {
					variations
				} = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
					variations: mapped,
					take: parsedCount,
				});

				console.log({ variations })

				if (!variations) {
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

				const {
					result
				} = context.test({
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

}