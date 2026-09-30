import { describe, it, expect } from "vitest"
import { buildCalendarMonthModel } from "@/lib/calendar-month-model"
import { buildCalendarDayMap, formatAPIDate } from "@orbit/shared/utils"
import {
  createMockHabitScheduleChild,
  createMockHabitScheduleItem,
} from "@orbit/shared/__tests__/factories"
import type { CalendarDayEntry } from "@orbit/shared/types/calendar"
import type { CalendarMonthResponse, HabitScheduleChild } from "@orbit/shared/types/habit"

function entry(status: CalendarDayEntry["status"], habitId = "h"): CalendarDayEntry {
  return { habitId, title: "t", status, isBadHabit: false, dueTime: null, isOneTime: false }
}

const june = new Date(2026, 5, 1)
const key = (d: Date) => formatAPIDate(d)

function sampleMonth(): Map<string, CalendarDayEntry[]> {
  return new Map<string, CalendarDayEntry[]>([
    [key(new Date(2026, 5, 1)), [entry("completed"), entry("completed", "h2")]],
    [key(new Date(2026, 5, 2)), [entry("completed")]],
    [key(new Date(2026, 5, 3)), [entry("completed"), entry("missed", "h2")]],
    [key(new Date(2026, 5, 5)), [entry("completed")]],
  ])
}

describe("buildCalendarMonthModel (mobile)", () => {
  it("computes month statistics from the current-month cells", () => {
    const { monthStats } = buildCalendarMonthModel(june, sampleMonth(), 1)
    expect(monthStats.totalLogs).toBe(5)
    expect(monthStats.missed).toBe(1)
    expect(monthStats.bestStreak).toBe(2)
    expect(monthStats.hasEntries).toBe(true)
  })

  it("builds a grid of whole weeks that includes each current-month day", () => {
    const { gridDays } = buildCalendarMonthModel(june, sampleMonth(), 1)
    expect(gridDays.length % 7).toBe(0)
    const june1 = gridDays.find((d) => d.dateStr === key(new Date(2026, 5, 1)))
    expect(june1?.isCurrentMonth).toBe(true)
    expect(june1?.completedCount).toBe(2)
    expect(june1?.totalCount).toBe(2)
    expect(june1?.completionRatio).toBe(1)
    expect(gridDays.filter((d) => d.isCurrentMonth)).toHaveLength(30)
  })

  it("reports an empty month", () => {
    expect(buildCalendarMonthModel(june, new Map(), 1).monthStats.hasEntries).toBe(false)
  })
})

describe("buildCalendarMonthModel with sub-habit logs (mobile)", () => {
  const september = new Date(2026, 8, 1)
  const loggedDate = "2026-09-28"

  function loggedChild(id: string): HabitScheduleChild {
    return createMockHabitScheduleChild({
      id,
      frequencyUnit: "Week",
      frequencyQuantity: 3,
      dueDate: "2026-10-19",
      scheduledDates: [loggedDate],
      isLoggedInRange: true,
      instances: [{ date: loggedDate, status: "Completed", logId: `${id}-log` }],
    })
  }

  function subHabitLogMonth(): CalendarMonthResponse {
    return {
      habits: [
        createMockHabitScheduleItem({
          id: "flexible-parent",
          frequencyUnit: "Year",
          isFlexible: true,
          dueDate: "2026-01-01",
          flexibleTarget: 1,
          flexibleCompleted: 1,
          children: [loggedChild("flexible-child")],
          hasSubHabits: true,
        }),
        createMockHabitScheduleItem({
          id: "weekly-parent",
          frequencyUnit: "Week",
          dueDate: "2026-10-05",
          scheduledDates: [loggedDate],
          isLoggedInRange: true,
          instances: [{ date: loggedDate, status: "Completed", logId: "parent-log" }],
          children: [loggedChild("weekly-child")],
          hasSubHabits: true,
        }),
      ],
      logs: {
        "flexible-parent": [],
        "weekly-parent": [
          { id: "parent-log", date: loggedDate, value: 1, createdAtUtc: "2026-09-28T08:00:00Z" },
        ],
      },
    }
  }

  it("counts each logged occurrence once", () => {
    const dayMap = buildCalendarDayMap(
      subHabitLogMonth(),
      { from: "2026-09-01", to: "2026-09-30" },
      new Date(2026, 8, 29, 12),
    )
    const { gridDays, monthStats } = buildCalendarMonthModel(september, dayMap, 1)
    const loggedDay = gridDays.find((gridDay) => gridDay.dateStr === loggedDate)

    expect(loggedDay?.entries.map((dayEntry) => dayEntry.habitId)).toEqual([
      "flexible-child",
      "weekly-parent",
    ])
    expect(loggedDay?.completedCount).toBe(2)
    expect(loggedDay?.totalCount).toBe(2)
    expect(monthStats).toEqual({ totalLogs: 2, missed: 0, bestStreak: 1, hasEntries: true })
  })
})
