import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  processComposition,
  buildQuirks,
  handleContextRequest,
} from "@/lib/context-service";
import type { RootComponentInstance } from "@uniformdev/canvas";
import compositionFixture from "./fixtures/home-composition.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// processComposition — audience personalization
// ---------------------------------------------------------------------------

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
        const composition = cloneComposition();
        await processComposition({
          composition,
          quirks: { audience, hasReservation: "false" },
        });

        const content = getContentSlot(composition);
        const titles = getTitles(content);

        expect(titles[0]).toBe(expectedTitle);
      }
    );

    test('falls back to "Default Content" when no audience quirk is set', async () => {
      const composition = cloneComposition();
      await processComposition({ composition, quirks: {} });

      const content = getContentSlot(composition);
      const titles = getTitles(content);

      expect(titles[0]).toBe("Default Content");
    });
  });

  // ---------------------------------------------------------------------------
  // processComposition — reservation personalization
  // ---------------------------------------------------------------------------

  describe("reservation personalization", () => {
    test('resolves to "No Reservation" when hasReservation=false', async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { hasReservation: "false" },
      });

      const content = getContentSlot(composition);
      const titles = getTitles(content);

      expect(titles).toContain("No Reservation");
    });

    test('resolves to "Reservation" when hasReservation=true', async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { hasReservation: "true" },
      });

      const content = getContentSlot(composition);
      const titles = getTitles(content);

      expect(titles).toContain("Reservation");
    });

    test("removes the reservation slot entirely when hasReservation quirk is absent", async () => {
      const composition = cloneComposition();
      await processComposition({ composition, quirks: {} });

      const content = getContentSlot(composition);
      const titles = getTitles(content);

      expect(titles).not.toContain("No Reservation");
      expect(titles).not.toContain("Reservation");
    });
  });

  // ---------------------------------------------------------------------------
  // processComposition — A/B test resolution
  // ---------------------------------------------------------------------------

  describe("A/B test resolution", () => {
    test("resolves the $test node to either Control or Variant", async () => {
      const composition = cloneComposition();
      await processComposition({ composition, quirks: {} });

      const content = getContentSlot(composition);
      const titles = getTitles(content);

      const hasTestVariant = titles.some(
        (t) => t === "Control" || t === "Variant"
      );
      expect(hasTestVariant).toBe(true);
    });

    test("$test wrapper node is replaced by the resolved hero variant", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "golf", hasReservation: "true" },
      });

      const content = getContentSlot(composition);
      const types = getTypes(content);
      const titles = getTitles(content);

      expect(types).not.toContain("$test");
      const lastTitle = titles[titles.length - 1];
      expect(["Control", "Variant"]).toContain(lastTitle);
    });
  });

  // ---------------------------------------------------------------------------
  // processComposition — structural integrity
  // ---------------------------------------------------------------------------

  describe("structural integrity", () => {
    test("no $personalization wrapper nodes remain after processing", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "golf", hasReservation: "true" },
      });

      const types = getTypes(getContentSlot(composition));
      expect(types).not.toContain("$personalization");
    });

    test("no $test wrapper nodes remain after processing", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "golf", hasReservation: "true" },
      });

      const types = getTypes(getContentSlot(composition));
      expect(types).not.toContain("$test");
    });

    test("all remaining content nodes are hero components", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "loyalists", hasReservation: "true" },
      });

      const types = getTypes(getContentSlot(composition));
      types.forEach((t) => expect(t).toBe("hero"));
    });
  });

  // ---------------------------------------------------------------------------
  // processComposition — metadata cleanup
  // ---------------------------------------------------------------------------

  describe("metadata cleanup", () => {
    test("strips $pzCrit from personalized hero parameters", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "golf", hasReservation: "true" },
      });

      const content = getContentSlot(composition);
      for (const node of content) {
        expect(node.parameters).not.toHaveProperty("$pzCrit");
      }
    });

    test("strips $tstVrnt from resolved test variant parameters", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "golf", hasReservation: "true" },
      });

      const content = getContentSlot(composition);
      for (const node of content) {
        expect(node.parameters).not.toHaveProperty("$tstVrnt");
      }
    });

    test("strips top-level pz, control, and id properties from resolved nodes", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "corporate", hasReservation: "false" },
      });

      const content = getContentSlot(composition);
      for (const node of content) {
        const raw = node as unknown as Record<string, unknown>;
        expect(raw).not.toHaveProperty("pz");
        expect(raw).not.toHaveProperty("control");
        expect(raw).not.toHaveProperty("id");
      }
    });

    test("resolved nodes only contain clean component data", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: { audience: "loyalists", hasReservation: "true" },
      });

      const content = getContentSlot(composition);
      const allParamKeys = content.flatMap((n) =>
        Object.keys(n.parameters ?? {})
      );

      expect(allParamKeys).not.toContain("$pzCrit");
      expect(allParamKeys).not.toContain("$tstVrnt");
    });
  });

  // ---------------------------------------------------------------------------
  // processComposition — combined quirk scenarios (real profile shapes)
  // ---------------------------------------------------------------------------

  describe("combined quirks matching real profiles", () => {
    test("Marcus Chen — loyalists, local, has reservation", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: {
          audience: "loyalists",
          geoAudience: "local",
          hasReservation: "true",
        },
      });

      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Loyalists");
      expect(titles).toContain("Reservation");
    });

    test("Priya Patel — golf, local, has reservation", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: {
          audience: "golf",
          geoAudience: "local",
          hasReservation: "true",
        },
      });

      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Golfers");
      expect(titles).toContain("Reservation");
    });

    test("Sofia Rodriguez — leisure, out-of-towner, has reservation", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: {
          audience: "leisure",
          geoAudience: "out-of-towner",
          hasReservation: "true",
        },
      });

      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Leisure");
      expect(titles).toContain("Reservation");
    });

    test("James O'Brien — corporate, local, no reservation", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: {
          audience: "corporate",
          geoAudience: "local",
          hasReservation: "false",
        },
      });

      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Corporate");
      expect(titles).toContain("No Reservation");
    });

    test("Aisha Johnson — wellness, out-of-towner, has reservation", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: {
          audience: "wellness",
          geoAudience: "out-of-towner",
          hasReservation: "true",
        },
      });

      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Spa & Wellness");
      expect(titles).toContain("Reservation");
    });

    test("Tanya Brooks — leisure, local, no reservation", async () => {
      const composition = cloneComposition();
      await processComposition({
        composition,
        quirks: {
          audience: "leisure",
          geoAudience: "local",
          hasReservation: "false",
        },
      });

      const titles = getTitles(getContentSlot(composition));
      expect(titles[0]).toBe("For Leisure");
      expect(titles).toContain("No Reservation");
    });
  });
});

// ---------------------------------------------------------------------------
// buildQuirks — profile-to-quirks mapping
// ---------------------------------------------------------------------------

describe("buildQuirks", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns empty quirks when visitorId is null", async () => {
    const quirks = await buildQuirks(null);
    expect(quirks).toEqual({});
  });

  test("returns empty quirks when CDP responds with non-OK status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("not found", { status: 404 })
    );

    const quirks = await buildQuirks("unknown-visitor");
    expect(quirks).toEqual({});
  });

  test("maps profile fields to correct quirk keys", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audience: "golf",
          geoProximity: "local",
          reservation: { confirmationNumber: "TS-123" },
          membershipStatus: "member",
        }),
        { status: 200 }
      )
    );

    const quirks = await buildQuirks("2");
    expect(quirks).toEqual({
      audience: "golf",
      geoAudience: "local",
      hasReservation: "true",
    });
  });

  test("sets hasReservation to false when reservation is null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audience: "corporate",
          geoProximity: "local",
          reservation: null,
          membershipStatus: "member",
        }),
        { status: 200 }
      )
    );

    const quirks = await buildQuirks("4");
    expect(quirks).toEqual({
      audience: "corporate",
      geoAudience: "local",
      hasReservation: "false",
    });
  });

  test("omits audience quirk when profile.audience is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audience: "",
          geoProximity: "local",
          reservation: null,
          membershipStatus: "non-member",
        }),
        { status: 200 }
      )
    );

    const quirks = await buildQuirks("99");
    expect(quirks).not.toHaveProperty("audience");
    expect(quirks).toHaveProperty("geoAudience", "local");
  });
});

// ---------------------------------------------------------------------------
// handleContextRequest — full pipeline integration
// ---------------------------------------------------------------------------

describe("handleContextRequest (integration)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.UNIFORM_API_KEY = "test-api-key";
    process.env.UNIFORM_PROJECT_ID = "test-project-id";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.UNIFORM_API_KEY;
    delete process.env.UNIFORM_PROJECT_ID;
  });

  function mockFetchForProfile(profile: Record<string, unknown>) {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/profiles/")) {
        return Promise.resolve(
          new Response(JSON.stringify(profile), { status: 200 })
        );
      }

      if (url.includes("uniform.global")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "composition",
              compositionApiResponse: structuredClone(compositionFixture),
            }),
            { status: 200 }
          )
        );
      }

      return Promise.resolve(new Response("not found", { status: 404 }));
    });
  }

  test("returns personalized composition for loyalists visitor with reservation", async () => {
    mockFetchForProfile({
      audience: "loyalists",
      geoProximity: "local",
      reservation: { confirmationNumber: "TS-20260315-8841" },
      membershipStatus: "member",
    });

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), "1");
    expect(response.status).toBe(200);

    const data = await response.json();
    const content = data.compositionApiResponse.composition.slots.content;
    const types = content.map((n: ContentNode) => n.type);
    const titles = content.map((n: ContentNode) => getTitle(n));

    expect(types).not.toContain("$personalization");
    expect(types).not.toContain("$test");
    expect(titles[0]).toBe("For Loyalists");
    expect(titles).toContain("Reservation");
  });

  test("returns personalized composition for corporate visitor without reservation", async () => {
    mockFetchForProfile({
      audience: "corporate",
      geoProximity: "local",
      reservation: null,
      membershipStatus: "member",
    });

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), "4");
    expect(response.status).toBe(200);

    const data = await response.json();
    const content = data.compositionApiResponse.composition.slots.content;
    const titles = content.map((n: ContentNode) => getTitle(n));

    expect(titles[0]).toBe("For Corporate");
    expect(titles).toContain("No Reservation");
  });

  test("returns default content when no visitor-id is provided", async () => {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("uniform.global")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "composition",
              compositionApiResponse: structuredClone(compositionFixture),
            }),
            { status: 200 }
          )
        );
      }

      return Promise.resolve(new Response("not found", { status: 404 }));
    });

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), null);
    expect(response.status).toBe(200);

    const data = await response.json();
    const content = data.compositionApiResponse.composition.slots.content;
    const titles = content.map((n: ContentNode) => getTitle(n));

    expect(titles[0]).toBe("Default Content");
  });

  test("passes through upstream error status and body from Uniform API", async () => {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("uniform.global")) {
        return Promise.resolve(
          new Response("API key was not valid", { status: 401 })
        );
      }

      return Promise.resolve(new Response("not found", { status: 404 }));
    });

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), null);
    expect(response.status).toBe(401);

    const body = await response.text();
    expect(body).toBe("API key was not valid");
  });

  test("returns 400 when Uniform credentials are missing", async () => {
    delete process.env.UNIFORM_API_KEY;
    delete process.env.UNIFORM_PROJECT_ID;

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), null);
    expect(response.status).toBe(400);
  });
});
