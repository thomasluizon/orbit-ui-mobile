import { readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T } from "./_harness.mjs"
import {
  attachPerformanceMetrics,
  performanceMeasurementPrompt,
  resolvePerformanceMeasurement,
} from "../lib/performance-measurement.mjs"

const availableInput = () => ({
  status: "available",
  statsReset: "2026-03-18T13:12:11.039503Z",
  windowDays: 142.61,
  accountSkew: { maxHabitsPerAccount: 848, averageHabitsPerAccount: 21.69 },
  tableStats: [
    { table: "Habits", liveRows: 1106, columnCount: 29, seqScan: 310101, seqTupRead: 196237004 },
    { table: "HabitLogs", liveRows: 4014, columnCount: 9, seqScan: 58210, seqTupRead: 129999081 },
  ],
  queryStats: [
    {
      queryId: "habit-logs",
      rootTable: "HabitLogs",
      calls: 5462,
      rows: 12972237,
      bytesPerRow: 97.19,
      queryShape: 'SELECT h."Id", h."CreatedAtUtc", h."Date", h."DeletedAtUtc", h."HabitId", h."IsDeleted", h."Note", h."UpdatedAtUtc", h."Value" FROM "HabitLogs" h WHERE h."HabitId" = ANY ($1)',
    },
    {
      queryId: "habit-list",
      rootTable: "Habits",
      calls: 23802,
      rows: 10938123,
      bytesPerRow: 348.67,
      queryShape: `SELECT ${Array.from({ length: 29 }, (_, index) => `h."Column${index}"`).join(", ")} FROM "Habits" h WHERE h."UserId" = $1 ORDER BY h."Id"`,
    },
    {
      queryId: "reminder-sweep",
      rootTable: "Habits",
      calls: 145349,
      rows: 2558264,
      bytesPerRow: 348.67,
      queryShape: 'SELECT h."Id", h."ReminderEnabled" FROM "Habits" h WHERE h."ReminderEnabled"',
    },
    {
      queryId: "bounded-projection",
      rootTable: "Habits",
      calls: 100,
      rows: 1000,
      bytesPerRow: 40,
      queryShape: 'SELECT h."Id", h."Title", h."DueDate" FROM "Habits" h WHERE h."UserId" = $1 ORDER BY h."Id" LIMIT $2 OFFSET $3',
    },
  ],
})

export const cases = () => {
  const auditWorkflow = readFileSync(join(REPO_ROOT, ".claude", "workflows", "audit.mjs"), "utf8")
  const readinessWorkflow = readFileSync(join(REPO_ROOT, ".claude", "workflows", "prod-readiness.mjs"), "utf8")
  T("performance-measurement: workflow metadata remains the required first statement", auditWorkflow.startsWith("export const meta = {"))
  T("performance-measurement: audit workflow executes the four measured signals", ["unbounded-user-list", "full-entity-projection", "large-table-fraction", "background-sweep-budget"].every((signal) => auditWorkflow.includes(signal)))
  T("performance-measurement: audit workflow returns an explicit performance verdict", auditWorkflow.includes("performanceVerdict: performanceMeasurement?.verdict"))
  T("performance-measurement: prod-readiness forwards only the performance measurement to the performance child", readinessWorkflow.includes("k === 'performance' ? performanceMeasurement : undefined"))
  const scopeResolutionIndex = auditWorkflow.indexOf("const surfaces = resolveSurfaces(kind, scope)")
  const scopedMeasurementIndex = auditWorkflow.indexOf("if (kind === 'performance' && surfaces.some(isApiSurface))")
  T("performance-measurement: requested scope is applied before API hot paths are measured", scopeResolutionIndex >= 0 && scopedMeasurementIndex > scopeResolutionIndex)

  const measurement = resolvePerformanceMeasurement(availableInput())
  T("performance-measurement: an available sample produces a measured verdict", measurement.verdict === "MEASURED")
  T("performance-measurement: rows ranking keeps the statement with the most rows first", measurement.rowsRanking[0]?.queryId === "habit-logs", measurement.rowsRanking.map((entry) => entry.queryId).join(","))
  T("performance-measurement: byte-weighted ranking makes the full habit list the top cost", measurement.egressRanking[0]?.queryId === "habit-list", measurement.egressRanking.map((entry) => entry.queryId).join(","))
  T("performance-measurement: an unbounded user list is signaled", measurement.signals.some((signal) => signal.kind === "unbounded-user-list" && signal.queryId === "habit-list"))
  T("performance-measurement: a full-entity projection is signaled from the real column count", measurement.signals.some((signal) => signal.kind === "full-entity-projection" && signal.queryId === "habit-list"))
  T("performance-measurement: a query returning a large table fraction is signaled", measurement.signals.some((signal) => signal.kind === "large-table-fraction" && signal.queryId === "habit-logs"))
  T("performance-measurement: a recurring sweep over budget is signaled", measurement.signals.some((signal) => signal.kind === "background-sweep-budget" && signal.queryId === "reminder-sweep"))
  T("performance-measurement: a bounded projected query is not signaled", !measurement.signals.some((signal) => signal.queryId === "bounded-projection"), JSON.stringify(measurement.signals))

  const codeOnly = resolvePerformanceMeasurement({ status: "unavailable", reason: "permission denied for pg_stat_statements" })
  T("performance-measurement: unreadable production views produce CODE_ONLY", codeOnly.verdict === "CODE_ONLY")
  T("performance-measurement: the code-only verdict retains the named reason", codeOnly.reason === "permission denied for pg_stat_statements", codeOnly.reason)
  const malformed = resolvePerformanceMeasurement({ status: "available", windowDays: 0, queryStats: [] })
  T("performance-measurement: malformed measurement fails to code-only instead of passing", malformed.verdict === "CODE_ONLY" && malformed.reason.includes("windowDays"), malformed.reason)

  const prompt = performanceMeasurementPrompt(measurement)
  T("performance-measurement: finder context carries production account skew", prompt.includes('"maxHabitsPerAccount":848'))
  T("performance-measurement: finder context carries both cost and row rankings", prompt.includes('"rankedByMonthlyEgress"') && prompt.includes('"rankedByRows"'))

  const enriched = attachPerformanceMetrics([
    { queryId: "habit-list", monthlyEgressBytes: 1, title: "Unbounded habits" },
  ], measurement)
  T("performance-measurement: findings take metrics from the measured query rather than agent prose", enriched[0].monthlyEgressBytes === measurement.egressRanking[0].monthlyEgressBytes, JSON.stringify(enriched[0]))
}
