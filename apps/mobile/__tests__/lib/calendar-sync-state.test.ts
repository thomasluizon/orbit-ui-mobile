import { describe, it, expect } from "vitest"
import {
  resolveCalendarSyncStep,
  resolveDisplayedErrorMessage,
  resolveSyncedSelection,
} from "@/lib/calendar-sync-state"

const baseStep = {
  wizardStage: "browse" as const,
  isProfileLoading: false,
  isOnline: true,
  isReviewMode: false,
  isQueryLoading: false,
  isQueryError: false,
  eventsStatus: "connected" as string | undefined,
}

describe("resolveCalendarSyncStep (mobile)", () => {
  it("prioritizes wizard stages over query state", () => {
    expect(resolveCalendarSyncStep({ ...baseStep, wizardStage: "importing" })).toBe("importing")
    expect(resolveCalendarSyncStep({ ...baseStep, wizardStage: "done" })).toBe("done")
    expect(resolveCalendarSyncStep({ ...baseStep, wizardStage: "error" })).toBe("error")
  })

  it("returns loading while the profile is loading", () => {
    expect(resolveCalendarSyncStep({ ...baseStep, isProfileLoading: true })).toBe("loading")
  })

  it("returns offline when disconnected", () => {
    expect(resolveCalendarSyncStep({ ...baseStep, isOnline: false })).toBe("offline")
  })

  it("reflects query loading and error", () => {
    expect(resolveCalendarSyncStep({ ...baseStep, isQueryLoading: true })).toBe("loading")
    expect(resolveCalendarSyncStep({ ...baseStep, isQueryError: true })).toBe("error")
  })

  it("returns not-connected only in manual mode", () => {
    expect(resolveCalendarSyncStep({ ...baseStep, eventsStatus: "not-connected" })).toBe(
      "not-connected",
    )
    expect(
      resolveCalendarSyncStep({ ...baseStep, isReviewMode: true, eventsStatus: "not-connected" }),
    ).toBe("select")
  })

  it("defaults to select", () => {
    expect(resolveCalendarSyncStep(baseStep)).toBe("select")
  })
})

describe("resolveDisplayedErrorMessage (mobile)", () => {
  const translate = (key: string) => `t:${key}`

  it("shows the wizard error message when the wizard failed", () => {
    expect(
      resolveDisplayedErrorMessage({
        wizardStage: "error",
        errorMessage: "boom",
        isQueryError: true,
        queryError: new Error("x"),
        translate,
      }),
    ).toBe("boom")
  })

  it("shows a translated query error when a query failed", () => {
    const result = resolveDisplayedErrorMessage({
      wizardStage: "browse",
      errorMessage: "",
      isQueryError: true,
      queryError: new Error("x"),
      translate,
    })
    expect(result.startsWith("t:")).toBe(true)
  })

  it("is empty when there is no error", () => {
    expect(
      resolveDisplayedErrorMessage({
        wizardStage: "browse",
        errorMessage: "",
        isQueryError: false,
        queryError: null,
        translate,
      }),
    ).toBe("")
  })
})

describe("resolveSyncedSelection (mobile)", () => {
  const events = [{ id: "a" }, { id: "b" }, { id: "c" }]

  it("selects every incoming event outside review mode", () => {
    expect([...resolveSyncedSelection(new Set(["a"]), events, false, "prev")].sort()).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("selects every incoming event on the first review load", () => {
    expect([...resolveSyncedSelection(new Set(["a"]), events, true, null)].sort()).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("keeps only still-present prior selections on later review loads", () => {
    expect([...resolveSyncedSelection(new Set(["a", "z"]), events, true, "prev")].sort()).toEqual([
      "a",
    ])
  })
})
