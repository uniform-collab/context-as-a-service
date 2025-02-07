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
		request.headers.forEach((value, key) => {
			if (key === 'quirks-segment') {
				quirks["segment"] = value;
			}
			// console.log({ key, value });
		});

		const response = await fetch(`https://uniform.global/api/v1/composition?slug=${url.searchParams.get('slug')}&projectId=${env.UNIFORM_PROJECT_ID}`, {
			...request,
			headers: {
				...request.headers,
				'x-api-key': env.UNIFORM_API_KEY,
			},
		});

		// is ok and json
		const isOk = response.ok;
		if (isOk) {
			const { composition } = await response.json() as any;
		//	console.log({ composition })
			await processComposition({
				composition,
				quirks,
			});

			// console.log("processed", { data: composition.slots.content[0].parameters.title.value })
			return new Response(JSON.stringify(composition), {
				status: response.status,
				headers: response.headers,
			});
			//}
		}

		return response as any;
	},
} satisfies ExportedHandler<Env>;


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
				// console.log({ mapped: mapped.map(m => m.pz) })
				const {
					variations
				} = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
					variations: mapped,
					take: parsedCount,
				});

				// console.log({ variations })

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