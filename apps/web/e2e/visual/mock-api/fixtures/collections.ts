import type { PaginatedResponse, HabitScheduleItem, HabitTag } from '@orbit/shared/types/habit'
import type { PaginatedGoalResponse } from '@orbit/shared/types/goal'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'

/** Empty single page — Today/all-habits render their deterministic empty state. */
export const emptyHabitsPageFixture = {
  items: [],
  page: 1,
  pageSize: 200,
  totalCount: 0,
  totalPages: 1,
} satisfies PaginatedResponse<HabitScheduleItem>

/** Empty single page — the goals panel renders its empty state. */
export const emptyGoalsPageFixture = {
  items: [],
  page: 1,
  pageSize: 100,
  totalCount: 0,
  totalPages: 1,
} satisfies PaginatedGoalResponse

/** No tags — the tag filter row stays collapsed. */
export const emptyTagsFixture: HabitTag[] = []

/** No saved checklist templates. */
export const emptyChecklistTemplatesFixture: ChecklistTemplate[] = []

/** Zero habits — free-tier create gate stays open (< 10). */
export const habitCountFixture = { count: 0 }
