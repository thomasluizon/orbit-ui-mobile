import { describe, expect, it } from "vitest";
import { buildUpgradeHref, getUpgradeFallbackRoute } from "@/lib/upgrade-route";

describe("upgrade route helpers", () => {
  it("builds an upgrade href that preserves the source route", () => {
    expect(buildUpgradeHref("/calendar")).toEqual({
      pathname: "/upgrade",
      params: { from: "/calendar" },
    });
  });

  it("prefers the preserved source route when present", () => {
    expect(getUpgradeFallbackRoute("/progress", "/profile")).toBe(
      "/progress",
    );
    expect(
      getUpgradeFallbackRoute(["/progress", "/profile"], "/profile"),
    ).toBe("/progress");
  });

  it("falls back to the default route on direct upgrade entry", () => {
    expect(getUpgradeFallbackRoute(undefined, "/profile")).toBe("/profile");
    expect(getUpgradeFallbackRoute([], "/profile")).toBe("/profile");
  });

  it("returns legacy calendar upgrades to the current calendar route", () => {
    expect(getUpgradeFallbackRoute("/calendar-sync", "/profile")).toBe("/calendar");
  });
});
