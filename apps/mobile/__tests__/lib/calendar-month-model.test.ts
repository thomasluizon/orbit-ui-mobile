import { describe, it, expect } from "vitest"
import { buildCalendarMonthModel } from "@/lib/calendar-month-model"
import { formatAPIDate } from "@orbit/shared/utils"
import type { CalendarDayEntry } from "@orbit/shared/types/calendar"

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
