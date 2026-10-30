import { tsImport } from 'tsx/esm/api'
import { startingStepAnswer } from './one-small-step.mjs'
import { suggestionAnswer } from './suggestions.mjs'

const shared = Object.assign({}, ...await Promise.all([
  'chat/account-rows-core', 'chat/metrics-card-core', 'chat/habit-ranking-core', 'chat/habit-list-core',
  'chat/day-summary-core', 'chat/read-block-core', 'chat/record-list-core', 'chat/answer-block-controller',
  'chat/gamification-card-core', 'utils/goal-metrics', 'utils/progress', 'utils/streak-week', 'utils/completion-series', 'types/chat',
  'chat/block-kinds', 'chat/habit-month', 'utils/calendar-month',
].map((path) => tsImport(`../../packages/shared/src/${path}.ts`, import.meta.url))))

function habitList(card, { t }) {
  const items = card.items.slice(0, 3)
  return { title: t(card.read ? 'nav.habits' : card.scope === 'all' ? 'chat.habitList.allTitle' : 'chat.habitList.title'),
    count: items.length ? t('chat.habitList.count', { shown: items.length, total: card.totalCount ?? card.items.length }) : undefined,
    items: items.map((item) => ({ title: item.title, emoji: item.emoji, isSkippedOnDate: item.isSkippedOnDate ?? false,
      status: item.isSkippedOnDate ? t('habits.statusDot.skip')
        : localStatus(shared.habitListSnapshotStatusKey(item, Boolean(card.read)), t) })),
    empty: items.length ? undefined : t(card.read || card.scope === 'all' ? 'chat.habitList.allEmpty' : 'chat.habitList.todayEmpty'),
  }
}
const localStatus = (key, t) => key ? t(key) : undefined

function goalList(card, { t, locale }) {
  return { title: t('chat.goalList.title'), items: card.items.map((item) => ({ title: item.title,
    progress: t('chat.goalList.progress', { current: item.current, target: item.target, unit: item.unit }),
    tracking: localStatus(shared.getGoalMetricsStatusPresentation(item.trackingStatus)?.labelKey, t),
    deadline: item.deadline ? t('chat.goalList.deadline', { date: shared.formatGoalMetricsDate(item.deadline, locale) }) : undefined,
    projected: item.projectedCompletionDate ? t('chat.goalList.projected', { date: shared.formatGoalMetricsDate(item.projectedCompletionDate, locale) }) : undefined,
  })), empty: card.items.length ? undefined : t('chat.goalList.empty') }
}

function chart(series, locale) {
  const points = series ? shared.mapCompletionSeries(series, locale) : []
  return points.some((point) => point.scheduled > 0) ? points.map(({ dateLabel, rate, scheduled, completed }) =>
    ({ date: dateLabel, rate, scheduled, completed })) : undefined
}

function metrics(card, { t, locale }) {
  return { title: card.habitId && card.habitTitle?.trim()
    ? t('chat.metrics.habitTitle', { name: card.habitTitle.trim() }) : t('chat.metrics.title'),
    window: !card.read && card.periodMetrics ? shared.formatReadWindow(card.periodMetrics.window, locale) : undefined,
    empty: card.hasData ? undefined : t('chat.metrics.empty'),
    chart: card.hasData ? chart(card.series, locale) : undefined,
    figures: shared.getMetricsRows(card).map((row) => ({
      label: t(shared.metricsFigureLabelKey(row.id, row.labelKey)), value: row.value ?? t('chat.metrics.noFigure'),
    })),
  }
}

function periodTotal(card, { t, locale }) {
  return { title: t(`chat.readBlock.metric.${card.metric}`), value: new Intl.NumberFormat(locale).format(card.value),
    unit: t(`chat.readBlock.unit.${card.unit}`, { count: card.value }), window: shared.formatReadWindow(card.metrics.window, locale) }
}
function periodComparison(card, { t, locale }) {
  const number = new Intl.NumberFormat(locale)
  const relative = card.baselineValue !== 0 && card.relativeDelta != null
    ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(card.relativeDelta) : null
  return { title: t(`chat.readBlock.metric.${card.metric}`),
    current: { window: shared.formatReadWindow(card.current.window, locale), value: number.format(card.currentValue) },
    baseline: { window: shared.formatReadWindow(card.baseline.window, locale), value: number.format(card.baselineValue) },
    delta: { label: t('chat.readBlock.delta'), value: new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }).format(card.absoluteDelta), relative },
    unit: t(`chat.readBlock.unit.${card.unit}`, { count: card.currentValue }),
  }
}
function periodInsight(card, { t, locale }) {
  return { title: t('chat.insight.title'), window: shared.formatReadWindow({ from: card.dateFrom, to: card.dateTo }, locale),
    figures: [{ label: t('chat.insight.completionRate'), value: `${card.completionRate}%` },
      { label: t('chat.insight.daysLogged'), value: String(card.activeDays) }], chart: chart(card.series, locale) }
}
function daySummary(card, { t }) {
  const rows = (card.rows ?? []).slice(0, 20)
  return { title: t(card.read ? 'chat.readBlock.dayTitle' : 'chat.daySummary.title'),
    items: rows.map((item) => ({ title: item.title, emoji: item.emoji,
      status: localStatus(card.read ? shared.habitReadStatusKey(item.status, item.isBadHabit)
        : item.status === 'overdue' ? 'chat.habitList.overdue' : null, t) })),
    overdue: { label: t('chat.daySummary.overdue'), value: card.overdueCount },
    streak: card.read ? undefined : { label: t('chat.daySummary.streak'), value: card.currentStreak },
    progress: card.due === 0 ? t(card.read ? 'chat.readBlock.nothingDue' : 'chat.daySummary.nothingDue')
      : t('chat.daySummary.doneOfDue', { done: card.done, due: card.due }),
    count: (card.totalRows ?? rows.length) > 20 ? t('chat.daySummary.rowCount', { shown: rows.length, total: card.totalRows }) : undefined,
  }
}
function streak(card, { t, locale, accountDate }) {
  const window = card.read ? shared.readBlockWindow(card.read.scope) : null
  const asOf = window?.to ?? accountDate
  const days = shared.buildStreakWeekDays(card, card.currentStreak, card.isFrozenToday,
    asOf ? new Date(`${asOf}T12:00:00Z`) : new Date(), 14, 'UTC', card.firstEligibleDate)
  return { title: t('chat.streakCard.title'), current: { label: t('chat.streakCard.current'), value: new Intl.NumberFormat(locale).format(card.currentStreak) },
    level: t('progressScreen.achievements.level', { level: card.level, title: t(shared.getGamificationLevelTitleKey(card.level)) }),
    xp: t('chat.streakCard.xp', { current: new Intl.NumberFormat(locale).format(card.totalXp), next: new Intl.NumberFormat(locale).format(card.xpForNextLevel) }),
    days: days.map((day) => ({ date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date),
      status: t(day.status === 'not-scheduled' ? 'calendar.dayCell.notScheduled' : `progressScreen.streak.${day.status}`) })),
    achievements: (card.achievementDiscs ?? card.recentAchievements).slice(0, 6)
      .map((disc) => ({ name: t(`gamification.achievements.${disc.id}.name`), earned: disc.earnedAt != null })),
  }
}
function gamification(card, { t, locale }) {
  const { profile, achievements, streak } = card.state
  const presentation = streak ? shared.gamificationStreakPresentation(streak, card.read, locale, t) : null
  return { title: t(shared.gamificationCardTitleKey(card)),
    streak: presentation ? { title: t('progressScreen.sections.streak'), current: new Intl.NumberFormat(locale).format(streak.currentStreak), unit: t('progressScreen.streak.currentLabel', { count: streak.currentStreak }),
      longest: { label: presentation.freeze.longestLabel, value: presentation.freeze.longestValue },
      tier: { label: presentation.freeze.tierLabel, value: presentation.freeze.tierValue },
      days: presentation.days.map((day, index) => ({ date: presentation.labels[index],
        status: day.status === 'not-scheduled' ? presentation.dayWords.notScheduled : presentation.dayWords[day.status] })),
      banked: { label: presentation.freeze.words.bankedLabel, value: streak.streakFreezesAccumulated, ceiling: streak.maxStreakFreezesAccumulated },
      used: { label: presentation.freeze.words.usedLabel, value: streak.freezesUsedThisMonth },
      next: streak.streakFreezesAccumulated < streak.maxStreakFreezesAccumulated ? presentation.freeze.words.nextFreezeProgress : undefined,
      protected: { label: presentation.freeze.words.protectedLabel, days: presentation.freeze.protectedDays.map(day => ({ date: day.dateLabel, state: day.isToday ? presentation.freeze.words.protectedToday : presentation.freeze.words.protectedDay })),
        empty: presentation.freeze.protectedDays.length === 0 ? presentation.freeze.words.protectedEmpty : undefined },
    } : undefined,
    level: profile ? t('progressScreen.achievements.level', { level: profile.level, title: t(shared.getGamificationLevelTitleKey(profile.level)) }) : undefined,
    xp: profile ? t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel }) : undefined,
    achievements: achievements?.achievements.map(achievement => {
      const name = t(`gamification.achievements.${achievement.id}.name`)
      const current = achievement.progressCurrent
      const target = achievement.progressTarget
      return { name, description: t(`gamification.achievements.${achievement.id}.description`),
        state: t(achievement.isEarned ? 'progressScreen.achievements.earnedState' : 'progressScreen.achievements.unearnedState', { name }),
        earned: achievement.isEarned ? t('progressScreen.achievements.earnedLabel') : undefined,
        progress: current != null && target != null ? t('progressScreen.achievements.progress', { current, target }) : undefined }
    }),
    empty: achievements?.achievements.length === 0 ? t('progressScreen.achievements.empty') : undefined,
  }
}
function calendar(card, { t, locale, timeFormat = '24h' }) {
  return { title: t('chat.calendarCard.title'), count: card.events.length,
    events: card.events.map((event) => ({ title: event.title,
      time: event.isAllDay ? t('chat.calendarCard.allDay') : new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12h', timeZone: 'UTC',
      }).format(new Date(event.start)),
    })),
    sync: card.sync ? { label: t('chat.calendarCard.sync'), value: t(card.sync.enabled ? `chat.calendarCard.syncState.${card.sync.status}` : 'chat.calendarCard.syncState.disabled') } : undefined,
    empty: card.events.length ? undefined : t('chat.calendarCard.empty'),
  }
}
function recordList(card, { t, locale }) {
  const number = new Intl.NumberFormat(locale)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
  return { title: t(`chat.recordList.title.${card.kind}`), count: t('chat.recordList.count', { shown: card.items.length, total: card.totalCount }),
    items: shared.filterRecordListItems(card.items, '', locale).map((item) => ({
      title: item.logDate ? shared.formatReadWindow({ from: item.logDate, to: item.logDate }, locale) : item.title,
      details: [shared.isUnreadRecord(card.kind, item, new Set()) ? t('chat.recordList.unread') : null,
        item.detail, item.value == null ? null : number.format(item.value), item.date ? date.format(new Date(item.date)) : null,
        card.kind === 'templates' && item.count != null ? t('chat.recordList.templateCount', { count: item.count }) : null,
        card.kind === 'keys' && item.state ? t(`chat.recordList.keyState.${item.state}`) : null].filter(Boolean),
    })), empty: card.items.length ? undefined : t('chat.recordList.empty'),
    limit: card.kind === 'templates' && card.items.some((item) => (item.count ?? 0) > 20) ? t('chat.recordList.templateLimit') : undefined,
  }
}
function accountRows(card, { t, locale }) {
  return { title: t(`chat.account.title.${card.kind}`),
    rows: shared.presentAccountRows(card).flatMap((row) => {
      const label = shared.accountRowLabelKey(row.key)
      return label ? [{ label: t(label), value: shared.formatAccountRowValue(row, locale, t) }] : []
    }), referralCode: card.kind === 'referral' ? card.referralCode : undefined,
  }
}
function habitRanking({ ranking: card }, { t, locale }) {
  const period = shared.formatHabitRankingPeriod(card.query, locale)
  return { title: t('chat.ranking.title'), from: t('chat.ranking.from', { date: period.from }), through: t('chat.ranking.through', { date: period.through }),
    rows: card.rows.map((row) => ({ label: `${new Intl.NumberFormat(locale).format(row.rank)}. ${row.emoji ? `${row.emoji} ` : ''}${row.name}`,
      value: t('chat.ranking.completions', { count: row.completedCount }) })),
    empty: card.rows.length ? undefined : t('chat.ranking.empty'), partial: !card.isComplete || card.offset !== 0 ? t('chat.ranking.partial') : undefined,
  }
}
function answerBlock(block, { t }, kind) {
  const props = { definition: { kind, block } }
  const view = shared.getAnswerBlockView(props, new shared.AnswerBlockController(props).getSnapshot(), (key, values) => t(`chat.choice.${key}`, values))
  return { title: view.title, options: view.options.map(({ label, description }) => ({ label, description })),
    freeText: view.freeTextLabel, submit: view.submitLabel }
}
function questionBlock(block, { t }) {
  return { title: block.title || block.questions[0].prompt, intro: block.intro,
    position: block.progress ? t('chat.choice.position', { position: block.progress.current, total: block.progress.total }) : undefined,
    progress: t('chat.question.progress', { answered: 0, total: block.questions.length }),
    questions: block.questions.map((question, index) => ({
      prompt: block.title || index > 0 ? question.prompt : undefined,
      options: question.options?.map((option) => ({ label: option.label, description: option.recommended ? t('chat.placement.recommended') : undefined }))
        ?? (question.type === 'yesNo' ? [{ label: t('common.yes') }, { label: t('common.no') }] : undefined),
      scale: question.type === 'scale' ? { values: [1, 2, 3, 4, 5], lowLabel: question.lowLabel, highLabel: question.highLabel } : undefined,
      slider: question.type === 'slider' ? { min: question.min, max: question.max, unit: question.unit } : undefined,
      freeText: question.allowFreeText ? t('chat.choice.freeText') : undefined,
    })), submit: t('chat.choice.submit') }
}
function habitMonth(card, { t, locale }) {
  const { months, dayMap, range } = shared.buildHabitMonthCalendar(card)
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'long' })
  return { title: t('chat.habitMonth.title'), months: months.map((month) => ({
    title: monthLabel.format(month),
    days: shared.buildCalendarMonthModel(month, dayMap, card.weekStartDay, card.today, range).gridDays
      .filter((day) => day.isCurrentMonth).map((day) => {
        const date = dayLabel.format(day.date)
        if (day.dateStr > card.today) return { date, future: t('calendar.dayCell.future') }
        return { date, today: day.isToday ? t('calendar.dayCell.today') : undefined,
          completed: day.completedCount, scheduled: day.totalCount }
      }),
  })) }
}
const renderers = shared.createChatBlockRegistry({ habitList, goalList, metrics, periodTotal, periodComparison, periodInsight, daySummary, streak,
  gamification, calendar, habitMonth, recordList, accountRows, habitRanking, choice: (card, options) => answerBlock(card, options, 'choice'),
  pickList: (card, options) => answerBlock(card, options, 'pickList'), question: questionBlock,
  habitSuggestions: (block, { locale }) => JSON.parse(suggestionAnswer([{ type: 'block', kind: 'habitSuggestions', block }], locale)).parts[0].block,
  oneSmallStep: (block, { locale }) => JSON.parse(startingStepAnswer([{ type: 'block', kind: 'oneSmallStep', block }], locale)).parts[0].block,
})

function projectBlock(part, options) {
  const parsed = shared.chatPartSchema.parse(part)
  const projection = renderers[parsed.kind](parsed.block, options)
  if (!parsed.block.read) return projection
  const snapshot = { kind: parsed.kind, block: parsed.block, read: parsed.block.read }
  const { message, window } = shared.readBlockPresentation(snapshot, 'resting', false, null)
  return { ...projection, window: window ? shared.formatReadWindow(window, options.locale) : projection.window,
    recovery: message ? options.t(message) : undefined }
}

export function visibleBlock(part, options) {
  try { return projectBlock(part, options) } catch (error) {
    error.blockKind = part.kind
    throw error
  }
}
