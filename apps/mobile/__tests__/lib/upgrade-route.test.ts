import { describe, expect, it } from "vitest";
import { buildUpgradeHref, getUpgradeFallbackRoute } from "@/lib/upgrade-route";

describe("upgrade route helpers", () => {
  it("builds an upgrade href that preserves the source route", () => {
    expect(buildUpgradeHref("/calendar-sync")).toEqual({
      pathname: "/upgrade",
      params: { from: "/calendar-sync" },
    });
  });

  it("prefers the preserved source route when present", () => {
    expect(getUpgradeFallbackRoute("/retrospective", "/profile")).toBe(
      "/retrospective",
    );
    expect(
      getUpgradeFallbackRoute(["/achievements", "/profile"], "/profile"),
    ).toBe("/achievements");
  });

  it("falls back to the default route on direct upgrade entry", () => {
    expect(getUpgradeFallbackRoute(undefined, "/profile")).toBe("/profile");
    expect(getUpgradeFallbackRoute([], "/profile")).toBe("/profile");
  });
});
