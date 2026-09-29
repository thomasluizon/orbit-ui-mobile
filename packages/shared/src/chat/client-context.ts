import type { ChatClientContext } from '../types/chat'
import { resolveHourCycle } from '../utils/locale-format'

interface ChatClientContextOptions {
  platform: ChatClientContext['platform']
  locale: string
  uses24HourClock?: boolean
  messageOrigin?: ChatClientContext['messageOrigin']
  entryPointIntent?: ChatClientContext['entryPointIntent']
}

export function buildChatClientContext({
  platform,
  locale,
  uses24HourClock,
  messageOrigin,
  entryPointIntent,
}: ChatClientContextOptions): ChatClientContext {
  return {
    platform,
    locale,
    timeFormat: resolveHourCycle(uses24HourClock, locale) === 'h23' ? '24h' : '12h',
    currentAppArea: 'chat',
    supportsHabitListCard: true,
    supportsHabitListDoneStatus: true,
    supportsGoalListCard: true,
    supportsMetricsCard: true,
    supportsPeriodInsightCard: true,
    supportsDaySummaryCard: true,
    supportsStreakCard: true,
    supportsCalendarCard: true,
    supportsRecordListCard: true,
    supportsAccountRowsCard: true,
    supportsPendingOperationChanges: true,
    supportsToolSteps: true,
    supportsFollowUps: true,
    ...(messageOrigin ? { messageOrigin } : {}),
    ...(entryPointIntent ? { entryPointIntent } : {}),
  }
}
