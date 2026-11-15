import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { followQuestionInView, moveQuestionInView, startQuestionInView, type QuestionBlockState } from '@orbit/shared/chat'
import type { Question } from '@orbit/shared/types/question-block'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useFlag } from '@/hooks/use-flag'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** With the guided flows on, a block of several questions shows one question at a time. */
export function useQuestionInView(questions: readonly Question[], state: QuestionBlockState) {
  const enabled = useFlag('orbit_guided_flows') && questions.length > 1
  const [inView, setInView] = useState(() => startQuestionInView(questions, state))
  const followed = followQuestionInView(inView, questions, state)
  if (followed !== inView) setInView(followed)
  return {
    enabled,
    index: followed.index,
    shown: enabled ? [questions[followed.index]!] : questions,
    move: (step: -1 | 1) => setInView(moveQuestionInView(followed, questions, state, step)),
  }
}

/** The previous control, the position of the question in view, and the next control. */
export function QuestionInViewNav({ index, total, onMove }: Readonly<{ index: number; total: number; onMove: (step: -1 | 1) => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View testID="question-in-view" style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
    <IconButton label={t('chat.question.previous')} disabled={index === 0} onClick={() => onMove(-1)}><ChevronLeft size={20} accessible={false} /></IconButton>
    <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{t('chat.choice.position', { position: index + 1, total })}</Text>
    <IconButton label={t('chat.question.next')} disabled={index === total - 1} onClick={() => onMove(1)}><ChevronRight size={20} accessible={false} /></IconButton>
  </View>
}
