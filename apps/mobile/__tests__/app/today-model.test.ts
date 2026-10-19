import { describe, expect, it } from "vitest";
import {
  buildTodayFilters,
  type TodayFiltersInput,
} from "@/app/(tabs)/today-model";

function inputOf(overrides: Partial<TodayFiltersInput> = {}): TodayFiltersInput {
  return {
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
  it("builds a today-view filter with the date window and overdue flag", () => {
    expect(
      buildTodayFilters(inputOf({ isTodayDate: true })),
    ).toEqual({
      dateFrom: "2026-07-08",
      dateTo: "2026-07-08",
      includeOverdue: true,
      includeGeneral: undefined,
    });
  });

  it("sets includeGeneral only when showGeneralOnToday is true", () => {
    expect(
      buildTodayFilters(inputOf({ showGeneralOnToday: true }))
        .includeGeneral,
    ).toBe(true);
    expect(
      buildTodayFilters(inputOf({ showGeneralOnToday: false }))
        .includeGeneral,
    ).toBeUndefined();
  });

  it("excludes overdue for a non-today date", () => {
    expect(
      buildTodayFilters(inputOf({ isTodayDate: false }))
        .includeOverdue,
    ).toBe(false);
  });

  it("applies search, frequency, and tags to a today-view filter", () => {
    expect(
      buildTodayFilters(
        inputOf({
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

  it("drops whitespace-only search", () => {
    expect(
      buildTodayFilters(inputOf({ searchQuery: "   " })).search,
    ).toBeUndefined();
  });
});


describe('restored habit view filters', () => {
  it('lists all dates in Todos while retaining search, frequency and tags', () => {
    expect(buildTodayFilters({ ...inputOf({ searchQuery: '  walk  ', selectedFrequency: 'Week', selectedTagIds: ['tag'] }), view: 'all' })).toEqual({ search: 'walk', frequencyUnit: 'Week', tagIds: ['tag'] })
  })
  it('requests Geral independently of the Hoje preference and frequency', () => {
    expect(buildTodayFilters({ ...inputOf({ searchQuery: ' walk ', selectedFrequency: 'Day', selectedTagIds: ['tag'], showGeneralOnToday: false }), view: 'general' })).toEqual({ isGeneral: true, search: 'walk', tagIds: ['tag'] })
  })
})
