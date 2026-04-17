import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { buildQuirks, handleContextRequest } from "@/lib/context-service";

const MINIMAL_COMPOSITION = {
  composition: {
    _name: "Test",
    _slug: "/",
    type: "page",
    parameters: {},
    slots: { content: [{ type: "hero", parameters: { title: { type: "text", value: "Hello" } } }] },
  },
};

// ---------------------------------------------------------------------------
// buildQuirks — profile-to-quirks mapping (demo utility)
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
// handleContextRequest — HTTP plumbing
// ---------------------------------------------------------------------------

describe("handleContextRequest", () => {
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

  function mockUniformApi(compositionResponse = MINIMAL_COMPOSITION) {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/profiles/")) {
        return Promise.resolve(
          new Response(JSON.stringify({ audience: "golf", geoProximity: "local", reservation: null, membershipStatus: "member" }), { status: 200 })
        );
      }

      if (url.includes("uniform.global")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ type: "composition", compositionApiResponse: structuredClone(compositionResponse) }),
            { status: 200 }
          )
        );
      }

      return Promise.resolve(new Response("not found", { status: 404 }));
    });
  }

  test("returns 200 with processed composition", async () => {
    mockUniformApi();

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), "1");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.type).toBe("composition");
  });

  test("returns default content when no visitor-id is provided", async () => {
    mockUniformApi();

    const response = await handleContextRequest(new URLSearchParams({ path: "/" }), null);
    expect(response.status).toBe(200);
  });

  test("passes through upstream error status and body from Uniform API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("API key was not valid", { status: 401 })
    );

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
