import type { ReactNode } from 'react'
import type { AnswerBlockProps, ChatBlockKind, MessageBubbleProps } from '@orbit/shared/chat'
import type { ChatBlockPart, ChatMessage } from '@orbit/shared/types/chat'
import { HabitListCard } from './habit-list-card'
import { GoalListCard } from './goal-list-card'
import { MetricsCard } from './metrics-card'
import { PeriodInsightCard } from './period-insight-card'
import { DaySummaryCard } from './day-summary-card'
import { StreakCard } from './streak-card'
import { CalendarCard } from './calendar-card'
import { RecordListCard } from './record-list-card'
import { AccountRowsCard } from './account-rows-card'

import { ChoiceBlock } from './choice-block'
import { PickListBlock } from './pick-list-block'

type BlockContent = { [Kind in ChatBlockKind]: Extract<ChatBlockPart, { kind: Kind }>['block'] }
type OpenAction = MessageBubbleProps['onActionChipClick']

const blockRegistry: { [Kind in ChatBlockKind]: (block: BlockContent[Kind], onOpen: OpenAction, answerProps: Omit<AnswerBlockProps, 'definition'>) => ReactNode } = {
  habitList: block => <HabitListCard habitList={block} />,
  goalList: (block, onOpen) => <GoalListCard goalList={block} onOpenGoal={id => onOpen?.(id, 'CreateGoal')} />,
  metrics: block => <MetricsCard metricsCard={block} />,
  periodInsight: block => <PeriodInsightCard periodInsight={block} />,
  daySummary: block => <DaySummaryCard daySummary={block} />,
  streak: block => <StreakCard streakCard={block} />,
  calendar: block => <CalendarCard calendarCard={block} />,
  recordList: block => <RecordListCard recordList={block} />,
  accountRows: block => <AccountRowsCard accountRows={block} />,
  choice: (block, _onOpen, props) => <ChoiceBlock key={block.blockId} block={block} {...props} />,
  pickList: (block, _onOpen, props) => <PickListBlock key={block.blockId} block={block} {...props} />,
}

export function ChatBlock<Kind extends ChatBlockKind>({ part, onActionChipClick, interaction, expired, savedAnswers }: Readonly<{
  part: { kind: Kind; block: BlockContent[Kind] }
  savedAnswers?: ChatMessage['blockAnswers']
  interaction?: AnswerBlockProps['interaction']
  expired?: boolean
  onActionChipClick: OpenAction
}>) {
  const savedAnswer = 'blockId' in part.block ? savedAnswers?.[part.block.blockId] : undefined
  return blockRegistry[part.kind](part.block, onActionChipClick, { interaction, expired, savedAnswer })
}
