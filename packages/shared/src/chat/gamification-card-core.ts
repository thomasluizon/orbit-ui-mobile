import type { AccountDayWords } from '../contracts/dates/DayStrip'
import type { FreezeBankProps } from '../contracts/display/FreezeBank'
import { buildProtectedDayLabels } from '../utils/progress'
import { getStreakTierLabelKey } from '../utils/gamification-selectors'
import { buildStreakWeekDays } from '../utils/streak-week'
import { formatReadWindow, readBlockWindow } from './read-block-core'
import type { GamificationCard } from '../types/chat'

export function gamificationCardTitleKey(card: GamificationCard): string {
  if (!card.state.profile) return card.state.achievements ? 'progressScreen.sections.achievements' : 'progressScreen.sections.streak'
  return card.state.achievements ? 'chat.gamificationCard.title' : 'chat.gamificationCard.levelTitle'
}

export function gamificationStreakPresentation(streak: NonNullable<GamificationCard['state']['streak']>, read: GamificationCard['read'], locale: string, t: (key: string, values?: Record<string, string | number>) => string): { freeze: FreezeBankProps; days: ReturnType<typeof buildStreakWeekDays>; dayWords: AccountDayWords; labels: string[]; stripLabel: string } {
  const window = read ? readBlockWindow(read.scope) : null
  const asOf = window ? new Date(`${window.to}T12:00:00Z`) : new Date()
  const days = buildStreakWeekDays(streak, streak.currentStreak, streak.isFrozenToday, asOf, 14, 'UTC', streak.firstEligibleDate)
  const dayWords = { notScheduled: t('calendar.dayCell.notScheduled'), active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'), missed: t('progressScreen.streak.missed'), today: window ? formatReadWindow(window, locale) : t('progressScreen.streak.today') }
  const daysTowardNext = Math.max(0, 7 - streak.daysUntilNextFreeze)
  const freeze: FreezeBankProps = {
    inSheet: true,
    banked: streak.streakFreezesAccumulated, ceiling: streak.maxStreakFreezesAccumulated,
    usedThisMonth: streak.freezesUsedThisMonth, daysTowardNext, earnRateDays: 7,
    longestValue: streak.longestStreak, longestLabel: t('progressScreen.streak.longest'),
    tierValue: t(getStreakTierLabelKey(streak.currentStreak)), tierLabel: t('streakDisplay.detail.tierTileLabel'),
    protectedDays: buildProtectedDayLabels(streak.recentFreezeDates, locale).map(day => ({ ...day, isToday: streak.isFrozenToday && day.id === days[13]!.dateStr })),
    words: { ...dayWords, legendLabel: t('progressScreen.streak.legend'), bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'),
      nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'),
      nextFreezeProgress: t('progressScreen.streak.nextOf', { current: daysTowardNext, total: 7 }),
      protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'),
      protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday') },
  }
  return { freeze, days, dayWords, labels: days.map(day => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date)),
    stripLabel: t('progressScreen.streak.stripWindow', { count: days.length }) }
}
