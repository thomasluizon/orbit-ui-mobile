import { Fragment, type ReactNode } from 'react'
import type { AnswerBlockProps, ChatBlockKind, MessageBubbleProps } from '@orbit/shared/chat'
import type { ChatBlockPart, ChatMessage, ReadBlockSnapshot } from '@orbit/shared/types/chat'
import { HabitSuggestionsCard } from './habit-suggestions-card'
import { HabitListCard } from './habit-list-card'
import { HabitRankingCard } from './habit-ranking-card'
import { GoalListCard } from './goal-list-card'
import { MetricsCard } from './metrics-card'
import { PeriodTotalCard } from './period-total-card'
import { PeriodComparisonCard } from './period-comparison-card'
import { ReadBlockBoundary } from './read-block-frame'
import { PeriodInsightCard } from './period-insight-card'
import { DaySummaryCard } from './day-summary-card'
import { GamificationCard } from './gamification-card'
import { StreakCard } from './streak-card'
import { HabitMonthCard } from './habit-month-card'
import { CalendarCard } from './calendar-card'
import { RecordListCard } from './record-list-card'
import { AccountRowsCard } from './account-rows-card'

import { ChoiceBlock } from './choice-block'
import { PickListBlock } from './pick-list-block'

type BlockContent = { [Kind in ChatBlockKind]: Extract<ChatBlockPart, { kind: Kind }>['block'] }
type OpenAction = MessageBubbleProps['onActionChipClick']

const blockRegistry: { [Kind in ChatBlockKind]: (block: BlockContent[Kind], onOpen: OpenAction, answerProps: Omit<AnswerBlockProps, 'definition'> & { message?: ChatMessage }) => ReactNode } = {
  habitSuggestions: (block, _onOpen, props) => props.message ? <HabitSuggestionsCard card={block} message={props.message} isOnline={props.interaction?.isOnline} /> : null,
  habitRanking: (block, _onOpen, props) => <HabitRankingCard habitRanking={block} isOnline={props.interaction?.isOnline} />,
  habitList: block => <HabitListCard habitList={block} />,
  goalList: (block, onOpen) => <GoalListCard goalList={block} onOpenGoal={id => onOpen?.(id, 'CreateGoal')} />,
  metrics: block => <MetricsCard metricsCard={block} />,
  periodTotal: block => <PeriodTotalCard card={block} />,
  periodComparison: block => <PeriodComparisonCard card={block} />,
  periodInsight: block => <PeriodInsightCard periodInsight={block} />,
  daySummary: block => <DaySummaryCard daySummary={block} />,
  gamification: block => <GamificationCard card={block} />,
  streak: block => <StreakCard streakCard={block} />,
  calendar: block => <CalendarCard calendarCard={block} />,
  habitMonth: block => <HabitMonthCard card={block} />,
  recordList: block => <RecordListCard recordList={block} />,
  accountRows: block => <AccountRowsCard accountRows={block} />,
  choice: (block, _onOpen, props) => <ChoiceBlock key={block.blockId} block={block} {...props} />,
  pickList: (block, _onOpen, props) => <PickListBlock key={block.blockId} block={block} {...props} />,
}

export function ChatBlock<Kind extends ChatBlockKind>({ part, onActionChipClick, interaction, expired, savedAnswers, message }: Readonly<{
  part: { kind: Kind; block: BlockContent[Kind] }
  message?: ChatMessage
  savedAnswers?: ChatMessage['blockAnswers']
  interaction?: AnswerBlockProps['interaction']
  expired?: boolean
  onActionChipClick: OpenAction
}>) {
  const savedAnswer = 'blockId' in part.block ? savedAnswers?.[part.block.blockId] : undefined
  if ('read' in part.block && part.block.read) {
    const snapshot = { kind: part.kind, block: part.block, read: part.block.read } as ReadBlockSnapshot
    return <ReadBlockBoundary snapshot={snapshot}>{current => <Fragment key={current.read.revision}>{blockRegistry[part.kind](current.block as BlockContent[Kind], onActionChipClick, { interaction, expired, savedAnswer, message })}</Fragment>}</ReadBlockBoundary>
  }
  return blockRegistry[part.kind](part.block, onActionChipClick, { interaction, expired, savedAnswer, message })
}
