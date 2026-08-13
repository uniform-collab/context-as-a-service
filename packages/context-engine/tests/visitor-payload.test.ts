import { describe, expect, test } from "vitest";
import { parseScoreCookie } from "@uniformdev/context";
import {
  CLIENT_VISITOR_BODY_MAX_CHARS,
  parseVisitorBody,
  resolvePostVisitorBody,
  visitorFromClientPayload,
} from "../src/visitor-payload";

describe("parseVisitorBody", () => {
  test("accepts quirks, device, scores, tests, enrichments, and events", () => {
    const parsed = parseVisitorBody(
      JSON.stringify({
        quirks: { audience: "golf" },
        device: { os: "ios", type: "phone" },
        scores: { launchCampaign: 10 },
        tests: { homeScreenHeroTest: "variant" },
        enrichments: [{ cat: "audience", key: "golf", str: 10 }],
        events: [{ event: "app_open" }],
      }),
    );

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.payload.quirks).toEqual({ audience: "golf" });
    expect(parsed.payload.device).toEqual({ os: "ios", type: "phone" });
    expect(parsed.payload.scores).toEqual({ launchCampaign: 10 });
    expect(parsed.payload.tests).toEqual({ homeScreenHeroTest: "variant" });
    expect(parsed.payload.enrichments).toEqual([
      { cat: "audience", key: "golf", str: 10 },
    ]);
    expect(parsed.payload.events).toEqual([{ event: "app_open" }]);
  });

  test("rejects bodies over 2000 characters", () => {
    const payload = JSON.stringify({
      quirks: { blob: "x".repeat(CLIENT_VISITOR_BODY_MAX_CHARS) },
    });
    expect(parseVisitorBody(payload).status).toBe("too-large");
  });

  test("rejects invalid JSON and non-objects", () => {
    expect(parseVisitorBody("not-json").status).toBe("invalid-json");
    expect(parseVisitorBody("[]").status).toBe("invalid-json");
    expect(parseVisitorBody("").status).toBe("empty");
  });
});

describe("visitorFromClientPayload", () => {
  test("encodes scores and tests into ufvd cookie format", () => {
    const identity = visitorFromClientPayload({
      quirks: { audience: "golf" },
      scores: { launchCampaign: 10 },
      tests: { homeScreenHeroTest: "variant" },
    });

    expect(identity.source).toBe("client-body");
    expect(identity.quirks).toEqual({ audience: "golf" });
    expect(identity.quirkCookieValue).toBe("");

    const decoded = parseScoreCookie(identity.cookieValue);
    expect(decoded?.scores?.launchCampaign).toBe(10);
    expect(decoded?.tests?.homeScreenHeroTest).toBe("variant");
  });

  test("flattens device attributes into quirks without overwriting explicit quirks", () => {
    const identity = visitorFromClientPayload({
      quirks: { os: "android" },
      device: { os: "ios", type: "phone" },
    });

    expect(identity.quirks).toEqual({ os: "android", type: "phone" });
  });
});

describe("resolvePostVisitorBody", () => {
  test("uses POST JSON and ignores GET fallback", () => {
    const result = resolvePostVisitorBody(
      "POST",
      JSON.stringify({ quirks: { audience: "golf" } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !result.identity) {
      return;
    }
    expect(result.identity.source).toBe("client-body");
    expect(result.identity.quirks).toEqual({ audience: "golf" });
  });

  test("returns null identity for GET or empty POST so proxies can fall back", () => {
    expect(resolvePostVisitorBody("GET", '{"quirks":{"audience":"golf"}}')).toEqual({
      ok: true,
      identity: null,
    });
    expect(resolvePostVisitorBody("POST", "")).toEqual({ ok: true, identity: null });
  });

  test("returns 400 for oversized or invalid POST bodies", () => {
    const tooLarge = resolvePostVisitorBody(
      "POST",
      JSON.stringify({ quirks: { blob: "x".repeat(CLIENT_VISITOR_BODY_MAX_CHARS) } }),
    );
    expect(tooLarge).toMatchObject({ ok: false, status: 400 });

    const invalid = resolvePostVisitorBody("POST", "{bad");
    expect(invalid).toMatchObject({ ok: false, status: 400 });
  });
});
