import { describe, test, expect } from "vitest";
import { processComposition } from "../src/index";
import type { RootComponentInstance } from "@uniformdev/canvas";
import type { ManifestV2 } from "@uniformdev/context";
import compositionFixture from "./fixtures/home-composition.json";
import manifest from "./fixtures/context-manifest.json";

function cloneComposition(): RootComponentInstance {
  return structuredClone(
    compositionFixture.composition
  ) as unknown as RootComponentInstance;
}

interface ContentNode {
  type: string;
  parameters?: Record<string, { type: string; value?: unknown; locales?: Record<string, string> }>;
  slots?: Record<string, ContentNode[]>;
}

function getContentSlot(composition: RootComponentInstance): ContentNode[] {
  return ((composition as unknown as { slots: { content: ContentNode[] } }).slots?.content) ?? [];
}

function getTitle(node: ContentNode): string {
  const titleParam = node.parameters?.title;
  return titleParam?.locales?.["en-US"] ?? String(titleParam?.value ?? "");
}

function getTypes(nodes: ContentNode[]): string[] {
  return nodes.map((n) => n.type);
}

function getTitles(nodes: ContentNode[]): string[] {
  return nodes.map(getTitle);
}

async function process(quirks: Record<string, string>) {
  const composition = cloneComposition();
  await processComposition({
    composition,
    quirks,
    manifest: manifest as ManifestV2,
  });
  return composition;
}

describe("processComposition", () => {
  describe("audience personalization", () => {
    test.each([
      { audience: "loyalists", expectedTitle: "For Loyalists" },
      { audience: "golf", expectedTitle: "For Golfers" },
      { audience: "leisure", expectedTitle: "For Leisure" },
      { audience: "corporate", expectedTitle: "For Corporate" },
      { audience: "wellness", expectedTitle: "For Spa & Wellness" },
    ])(
      'resolves to "$expectedTitle" when audience=$audience',
      async ({ audience, expectedTitle }) => {
        const composition = await process({ audience, hasReservation: "false" });
        const titles = getTitles(getContentSlot(composition));
        expect(titles[0]).toBe(expectedTitle);
      }
    );

    test('falls back to "Default Content" when no audience quirk is set', async () => {
      const composition = await process({});
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("Default Content");
    });
  });

  describe("reservation personalization", () => {
    test('resolves to "No Reservation" when hasReservation=false', async () => {
      const composition = await process({ hasReservation: "false" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles).toContain("No Reservation");
    });

    test('resolves to "Reservation" when hasReservation=true', async () => {
      const composition = await process({ hasReservation: "true" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles).toContain("Reservation");
    });

    test("removes the reservation slot entirely when hasReservation quirk is absent", async () => {
      const composition = await process({});
      const titles = getTitles(getContentSlot(composition));
      expect(titles).not.toContain("No Reservation");
      expect(titles).not.toContain("Reservation");
    });
  });

  describe("A/B test resolution", () => {
    test("resolves the $test node to either Control or Variant", async () => {
      const composition = await process({});
      const titles = getTitles(getContentSlot(composition));
      const hasTestVariant = titles.some((t) => t === "Control" || t === "Variant");
      expect(hasTestVariant).toBe(true);
    });

    test("$test wrapper node is replaced by the resolved hero variant", async () => {
      const composition = await process({ audience: "golf", hasReservation: "true" });
      const content = getContentSlot(composition);
      const types = getTypes(content);
      const titles = getTitles(content);

      expect(types).not.toContain("$test");
      const lastTitle = titles[titles.length - 1];
      expect(["Control", "Variant"]).toContain(lastTitle);
    });
  });

  describe("structural integrity", () => {
    test("no $personalization wrapper nodes remain after processing", async () => {
      const composition = await process({ audience: "golf", hasReservation: "true" });
      const types = getTypes(getContentSlot(composition));
      expect(types).not.toContain("$personalization");
    });

    test("no $test wrapper nodes remain after processing", async () => {
      const composition = await process({ audience: "golf", hasReservation: "true" });
      const types = getTypes(getContentSlot(composition));
      expect(types).not.toContain("$test");
    });

    test("all remaining content nodes are hero components", async () => {
      const composition = await process({ audience: "loyalists", hasReservation: "true" });
      const types = getTypes(getContentSlot(composition));
      types.forEach((t) => expect(t).toBe("hero"));
    });
  });

  describe("metadata cleanup", () => {
    test("strips $pzCrit from personalized hero parameters", async () => {
      const composition = await process({ audience: "golf", hasReservation: "true" });
      for (const node of getContentSlot(composition)) {
        expect(node.parameters).not.toHaveProperty("$pzCrit");
      }
    });

    test("strips $tstVrnt from resolved test variant parameters", async () => {
      const composition = await process({ audience: "golf", hasReservation: "true" });
      for (const node of getContentSlot(composition)) {
        expect(node.parameters).not.toHaveProperty("$tstVrnt");
      }
    });

    test("strips top-level pz, control, and id properties from resolved nodes", async () => {
      const composition = await process({ audience: "corporate", hasReservation: "false" });
      for (const node of getContentSlot(composition)) {
        const raw = node as unknown as Record<string, unknown>;
        expect(raw).not.toHaveProperty("pz");
        expect(raw).not.toHaveProperty("control");
        expect(raw).not.toHaveProperty("id");
      }
    });

    test("resolved nodes only contain clean component data", async () => {
      const composition = await process({ audience: "loyalists", hasReservation: "true" });
      const allParamKeys = getContentSlot(composition).flatMap((n) =>
        Object.keys(n.parameters ?? {})
      );
      expect(allParamKeys).not.toContain("$pzCrit");
      expect(allParamKeys).not.toContain("$tstVrnt");
    });
  });

  describe("combined quirks matching real profiles", () => {
    test("Marcus Chen — loyalists, local, has reservation", async () => {
      const composition = await process({ audience: "loyalists", geoAudience: "local", hasReservation: "true" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Loyalists");
      expect(titles).toContain("Reservation");
    });

    test("Priya Patel — golf, local, has reservation", async () => {
      const composition = await process({ audience: "golf", geoAudience: "local", hasReservation: "true" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Golfers");
      expect(titles).toContain("Reservation");
    });

    test("Sofia Rodriguez — leisure, out-of-towner, has reservation", async () => {
      const composition = await process({ audience: "leisure", geoAudience: "out-of-towner", hasReservation: "true" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Leisure");
      expect(titles).toContain("Reservation");
    });

    test("James O'Brien — corporate, local, no reservation", async () => {
      const composition = await process({ audience: "corporate", geoAudience: "local", hasReservation: "false" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Corporate");
      expect(titles).toContain("No Reservation");
    });

    test("Aisha Johnson — wellness, out-of-towner, has reservation", async () => {
      const composition = await process({ audience: "wellness", geoAudience: "out-of-towner", hasReservation: "true" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Spa & Wellness");
      expect(titles).toContain("Reservation");
    });

    test("Tanya Brooks — leisure, local, no reservation", async () => {
      const composition = await process({ audience: "leisure", geoAudience: "local", hasReservation: "false" });
      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Leisure");
      expect(titles).toContain("No Reservation");
    });
  });
});
