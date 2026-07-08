import { describe, expect, it } from "vitest";
import {
  buildTodayFilters,
  type TodayFiltersInput,
} from "@/app/(tabs)/today-model";

function inputOf(overrides: Partial<TodayFiltersInput> = {}): TodayFiltersInput {
  return {
    view: "today",
    dateStr: "2026-07-08",
    isTodayDate: true,
    searchQuery: "",
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
    ...overrides,
  };
}

describe("buildTodayFilters", () => {
  it("builds a general-view filter with only isGeneral by default", () => {
    expect(buildTodayFilters(inputOf({ view: "general" }))).toEqual({
      isGeneral: true,
    });
  });

  it("adds trimmed search and tags to a general-view filter, ignoring frequency", () => {
    expect(
      buildTodayFilters(
        inputOf({
          view: "general",
          searchQuery: "  run  ",
          selectedFrequency: "Day",
          selectedTagIds: ["t1", "t2"],
        }),
      ),
    ).toEqual({ isGeneral: true, search: "run", tagIds: ["t1", "t2"] });
  });

  it("builds a today-view filter with the date window and overdue flag", () => {
    expect(
      buildTodayFilters(inputOf({ view: "today", isTodayDate: true })),
    ).toEqual({
      dateFrom: "2026-07-08",
      dateTo: "2026-07-08",
      includeOverdue: true,
      includeGeneral: undefined,
    });
  });

  it("sets includeGeneral only when showGeneralOnToday is true", () => {
    expect(
      buildTodayFilters(inputOf({ view: "today", showGeneralOnToday: true }))
        .includeGeneral,
    ).toBe(true);
    expect(
      buildTodayFilters(inputOf({ view: "today", showGeneralOnToday: false }))
        .includeGeneral,
    ).toBeUndefined();
  });

  it("excludes overdue for a non-today date", () => {
    expect(
      buildTodayFilters(inputOf({ view: "today", isTodayDate: false }))
        .includeOverdue,
    ).toBe(false);
  });

  it("applies search, frequency, and tags to a today-view filter", () => {
    expect(
      buildTodayFilters(
        inputOf({
          view: "today",
          searchQuery: "walk",
          selectedFrequency: "Week",
          selectedTagIds: ["a"],
        }),
      ),
    ).toEqual({
      dateFrom: "2026-07-08",
      dateTo: "2026-07-08",
      includeOverdue: true,
      includeGeneral: undefined,
      search: "walk",
      frequencyUnit: "Week",
      tagIds: ["a"],
    });
  });

  it("builds an empty filter for other views and applies optional selections", () => {
    expect(buildTodayFilters(inputOf({ view: "all" }))).toEqual({});
    expect(
      buildTodayFilters(
        inputOf({
          view: "all",
          searchQuery: "x",
          selectedFrequency: "Month",
          selectedTagIds: ["z"],
        }),
      ),
    ).toEqual({ search: "x", frequencyUnit: "Month", tagIds: ["z"] });
  });

  it("drops whitespace-only search", () => {
    expect(
      buildTodayFilters(inputOf({ view: "all", searchQuery: "   " })).search,
    ).toBeUndefined();
  });
});
