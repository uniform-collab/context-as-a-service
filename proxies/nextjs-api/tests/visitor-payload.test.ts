import { describe, expect, test } from "vitest";
import { parseScoreCookie } from "@uniformdev/context";
import {
  CLIENT_VISITOR_BODY_MAX_CHARS,
  resolvePostVisitorBody,
  visitorFromNextPayload,
} from "@/lib/visitorPayload";

describe("Next.js visitorPayload (solution-level parser)", () => {
  test("maps this proxy's POST body onto quirks, including device and hasReservation", () => {
    const result = resolvePostVisitorBody(
      "POST",
      JSON.stringify({
        quirks: { audience: "golf" },
        device: { os: "ios" },
        hasReservation: false,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !result.identity) return;
    expect(result.identity.quirks).toEqual({
      audience: "golf",
      os: "ios",
      hasReservation: "false",
    });
  });

  test("encodes optional scores without putting quirks on the quirk cookie", () => {
    const identity = visitorFromNextPayload({
      quirks: { audience: "golf" },
      scores: { launchCampaign: 10 },
    });
    expect(identity.quirkCookieValue).toBe("");
    expect(parseScoreCookie(identity.cookieValue)?.scores?.launchCampaign).toBe(10);
  });

  test("GET or empty POST falls back to CDP/headers", () => {
    expect(resolvePostVisitorBody("GET", '{"audience":"golf"}')).toEqual({
      ok: true,
      identity: null,
    });
    expect(resolvePostVisitorBody("POST", "")).toEqual({ ok: true, identity: null });
  });

  test("rejects oversized or invalid POST bodies", () => {
    expect(
      resolvePostVisitorBody(
        "POST",
        JSON.stringify({ quirks: { blob: "x".repeat(CLIENT_VISITOR_BODY_MAX_CHARS) } }),
      ),
    ).toMatchObject({ ok: false, status: 400 });
    expect(resolvePostVisitorBody("POST", "{bad")).toMatchObject({ ok: false, status: 400 });
  });
});
