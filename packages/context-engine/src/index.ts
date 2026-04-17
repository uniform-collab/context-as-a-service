import {
  CANVAS_PERSONALIZE_SLOT,
  CANVAS_PERSONALIZE_TYPE,
  CANVAS_TEST_TYPE,
  CANVAS_TEST_SLOT,
  mapSlotToPersonalizedVariations,
  mapSlotToTestVariations,
  walkNodeTree,
} from "@uniformdev/canvas";
import type { ComponentInstance, ComponentParameter, RootComponentInstance } from "@uniformdev/canvas";
import { Context } from "@uniformdev/context";
import type { ManifestV2, ContextOptions } from "@uniformdev/context";

export interface ProcessCompositionOptions {
  composition: RootComponentInstance;
  quirks: Record<string, string>;
  manifest: ManifestV2;
  /**
   * Additional options forwarded to the Uniform Context constructor.
   * Use this to supply a custom `transitionStore` (e.g. CookieTransitionDataStore),
   * override `defaultConsent`, etc.
   */
  contextOptions?: Omit<Partial<ContextOptions>, "manifest">;
}

/**
 * Walks a Uniform composition tree and resolves personalization
 * and A/B test nodes in-place, then strips SDK metadata from
 * the output.
 */
export async function processComposition({
  composition,
  quirks,
  manifest,
  contextOptions,
}: ProcessCompositionOptions): Promise<void> {
  const context = new Context({
    defaultConsent: true,
    ...contextOptions,
    manifest,
  });

  await context.update({ quirks });

  walkNodeTree(composition, (treeNode) => {
    if (treeNode.type !== "component") return;
    const { node, actions } = treeNode;

    if (node.type === CANVAS_PERSONALIZE_TYPE) {
      resolvePersonalization(context, node, actions);
    } else if (node.type === CANVAS_TEST_TYPE) {
      resolveTest(context, node, actions);
    }
  });

  stripResolvedMetadata(composition);
}

function resolvePersonalization(
  context: Context,
  node: ComponentInstance,
  actions: { remove: () => void; replace: (replacement: ComponentInstance) => void; insertAfter: (nodes: ComponentInstance[]) => void },
): void {
  const slot = node.slots?.[CANVAS_PERSONALIZE_SLOT];
  const trackingEventName = node.parameters?.[
    "trackingEventName"
  ] as ComponentParameter<string>;
  const count = node.parameters?.["count"] as
    | ComponentParameter<number | string>
    | undefined;
  const algorithm = node.parameters?.["algorithm"] as
    | ComponentParameter<string>
    | undefined;

  let parsedCount: number | undefined;
  if (count) {
    if (typeof count.value === "string") {
      parsedCount = parseInt(count.value, 10);
    } else if (typeof count.value === "number") {
      parsedCount = count.value;
    } else {
      parsedCount = 1;
    }
  }

  const mapped = mapSlotToPersonalizedVariations(slot);
  const { variations } = context.personalize({
    name: trackingEventName?.value ?? "Untitled Personalization",
    variations: mapped,
    take: parsedCount,
    algorithm: algorithm?.value,
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
}

function resolveTest(
  context: Context,
  node: ComponentInstance,
  actions: { remove: () => void; replace: (replacement: ComponentInstance) => void },
): void {
  const slot = node.slots?.[CANVAS_TEST_SLOT];
  const testName = node.parameters?.["test"] as
    | ComponentParameter<string | undefined>
    | undefined;
  const mapped = mapSlotToTestVariations(slot);

  const { result } = context.test({
    name: testName?.value ?? "Untitled Test",
    variations: mapped,
  });

  if (!result) {
    actions.remove();
  } else {
    actions.replace(result);
  }
}

const METADATA_PARAMS = ["$pzCrit", "$tstVrnt"];
const METADATA_TOP_LEVEL = ["pz", "control", "id", "testDistribution"];

/**
 * Recursively strips Uniform SDK resolution metadata from all
 * nodes so the response only contains clean component data.
 */
export function stripResolvedMetadata(
  node: Record<string, unknown>,
): void {
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
