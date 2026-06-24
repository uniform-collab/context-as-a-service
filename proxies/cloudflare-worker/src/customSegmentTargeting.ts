import {
	CANVAS_PERSONALIZE_SLOT,
	CANVAS_PERSONALIZE_TYPE,
	mapSlotToPersonalizedVariations,
	walkNodeTree,
} from "@uniformdev/canvas";
import type {
	ComponentInstance,
	ComponentParameter,
	RootComponentInstance,
} from "@uniformdev/canvas";
import type {
	ContextPlugin,
	PersonalizationSelectionAlgorithm,
} from "@uniformdev/context";

/**
 * Key used both in the Uniform mesh manifest and on the personalization node's
 * `algorithm` parameter to select this selection algorithm.
 */
export const CUSTOM_SEGMENT_TARGETING_ALGORITHM = "custom-segment-targeting";

/**
 * Personalization criteria assigned to each variation by the segment-targeting
 * criteria editor (the value of the variation's `$pzCrit` parameter).
 *
 * `segmentId` references a row in the Cloudflare D1 `segments` table, whose
 * `customer_ids` column holds the customers that belong to it. The remaining
 * fields are metadata emitted by the editor and are not used for matching.
 */
export interface CustomSegmentTargetingCriteria {
	name?: string;
	segmentId?: string;
	segmentName?: string;
	rowCount?: number;
	sourceFilename?: string;
	uploadedAt?: string;
}

export interface CustomSegmentTargetingPluginOptions {
	/** Value of the `x-customer-id` request header for the current visitor. */
	customerId: string | null;
	/** Map of segment id -> set of customer ids that belong to that segment. */
	segments: Map<string, Set<string>>;
}

/**
 * Builds a Uniform Context plugin that selects personalization variations whose
 * assigned segment contains the current visitor's `x-customer-id`.
 *
 * Segment membership is resolved ahead of time (see `fetchSegmentMemberships`)
 * because Uniform's personalization selection algorithms are synchronous and
 * cannot perform the D1 lookup themselves.
 */
export function createCustomSegmentTargetingPlugin({
	customerId,
	segments,
}: CustomSegmentTargetingPluginOptions): ContextPlugin {
	const algorithm: PersonalizationSelectionAlgorithm<
		CustomSegmentTargetingCriteria
	> = ({ variations, take }) => {
		const allVariations = Array.from(variations);

		const matchingVariations = allVariations.filter((variant) => {
			const segmentId = variant.pz?.segmentId;
			if (!segmentId || !customerId) {
				return false;
			}
			return segments.get(segmentId)?.has(customerId) ?? false;
		});

		if (matchingVariations.length > 0) {
			return {
				personalized: true,
				variations: matchingVariations
					.map((variant) => ({ ...variant, control: false }))
					.slice(0, take),
			};
		}

		// Fall back to default variations (those without a segment target, e.g.
		// `{ crit: [], name: "default" }`) so the default content is preserved
		// when the visitor is not in any targeted segment.
		const defaultVariations = allVariations.filter(
			(variant) => !variant.pz?.segmentId,
		);

		return {
			personalized: false,
			variations: defaultVariations
				.map((variant) => ({ ...variant, control: false }))
				.slice(0, take),
		};
	};

	return {
		personalizationSelectionAlgorithms: {
			// IMPORTANT: must match the key used in the mesh manifest and the
			// personalization node's `algorithm` parameter.
			[CUSTOM_SEGMENT_TARGETING_ALGORITHM]: algorithm,
		},
	};
}

/**
 * Walks a composition and collects the segment ids referenced by any
 * personalization node that uses the custom-segment-targeting algorithm. Used
 * to batch-load segment membership from D1 before processing the composition.
 */
export function collectSegmentIds(
	composition: RootComponentInstance,
): string[] {
	const segmentIds = new Set<string>();

	walkNodeTree(composition, (treeNode) => {
		if (treeNode.type !== "component") return;
		const { node } = treeNode;
		if (node.type !== CANVAS_PERSONALIZE_TYPE) return;

		const algorithm = node.parameters?.["algorithm"] as
			| ComponentParameter<string>
			| undefined;
		if (algorithm?.value !== CUSTOM_SEGMENT_TARGETING_ALGORITHM) return;

		const slot = node.slots?.[CANVAS_PERSONALIZE_SLOT];
		const variations = mapSlotToPersonalizedVariations(slot) as Array<
			ComponentInstance & { pz?: CustomSegmentTargetingCriteria }
		>;
		for (const variation of variations) {
			const segmentId = variation.pz?.segmentId;
			if (segmentId) {
				segmentIds.add(segmentId);
			}
		}
	});

	return Array.from(segmentIds);
}

/**
 * Loads segment membership from the Cloudflare D1 `segments` table. Each row
 * stores `customer_ids` as a JSON array of customer id strings (a
 * comma-separated list is also accepted as a fallback).
 */
export async function fetchSegmentMemberships(
	db: D1Database,
	segmentIds: string[],
): Promise<Map<string, Set<string>>> {
	const memberships = new Map<string, Set<string>>();
	if (segmentIds.length === 0) {
		return memberships;
	}

	const placeholders = segmentIds.map(() => "?").join(", ");
	const { results } = await db
		.prepare(
			`SELECT id, customer_ids FROM segments WHERE id IN (${placeholders})`,
		)
		.bind(...segmentIds)
		.all<{ id: string; customer_ids: string }>();

	for (const row of results ?? []) {
		memberships.set(row.id, new Set(parseCustomerIds(row.customer_ids)));
	}

	return memberships;
}

function parseCustomerIds(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map((id) => String(id));
		}
	} catch {
		// Not JSON - fall back to a comma-separated list below.
	}

	return raw
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
}
