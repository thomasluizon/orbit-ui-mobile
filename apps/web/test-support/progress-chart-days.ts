/** The 30 days that the Progress layout spec serves to the bar chart. Day 1 has no schedule, and day 2 has no completion. */
export const progressChartDays = Array.from({ length: 30 }, (_, index) => ({
  startDate: `2026-09-${String(index + 1).padStart(2, '0')}`, endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  scheduled: index === 0 ? 0 : 4, completed: index < 2 ? 0 : 2,
  completionRate: index === 0 ? null : index === 1 ? 0 : 50,
}))

/** The text that the layout spec expects in the readout of day 2. A Vitest case reads it against the real chart. */
export const progressChartZeroDayReadout = { en: '0 of 4', 'pt-BR': '0 de 4' } as const
