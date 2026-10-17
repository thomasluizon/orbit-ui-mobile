import type { ReactNode } from 'react'
import type { ChatBlockKind, MessageBubbleProps } from '@orbit/shared/chat'
import type { ChatBlockPart } from '@orbit/shared/types/chat'
import { HabitListCard } from './habit-list-card'
import { GoalListCard } from './goal-list-card'
import { MetricsCard } from './metrics-card'
import { PeriodInsightCard } from './period-insight-card'
import { DaySummaryCard } from './day-summary-card'
import { StreakCard } from './streak-card'
import { CalendarCard } from './calendar-card'
import { RecordListCard } from './record-list-card'
import { AccountRowsCard } from './account-rows-card'

type BlockContent = { [Kind in ChatBlockKind]: Extract<ChatBlockPart, { kind: Kind }>['block'] }
type OpenAction = MessageBubbleProps['onActionChipClick']

const blockRegistry: { [Kind in ChatBlockKind]: (block: BlockContent[Kind], onOpen: OpenAction) => ReactNode } = {
  habitList: block => <HabitListCard habitList={block} />,
  goalList: (block, onOpen) => <GoalListCard goalList={block} onOpenGoal={id => onOpen?.(id, 'CreateGoal')} />,
  metrics: block => <MetricsCard metricsCard={block} />,
  periodInsight: block => <PeriodInsightCard periodInsight={block} />,
  daySummary: block => <DaySummaryCard daySummary={block} />,
  streak: block => <StreakCard streakCard={block} />,
  calendar: block => <CalendarCard calendarCard={block} />,
  recordList: block => <RecordListCard recordList={block} />,
  accountRows: block => <AccountRowsCard accountRows={block} />,
}

export function ChatBlock<Kind extends ChatBlockKind>({ part, onActionChipClick }: Readonly<{
  part: { kind: Kind; block: BlockContent[Kind] }
  onActionChipClick: OpenAction
}>) {
  return blockRegistry[part.kind](part.block, onActionChipClick)
}
