import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, findNodeHandle, Text, View } from 'react-native'
import { followQuestionInView, moveQuestionInView, startQuestionInView, type QuestionBlockState } from '@orbit/shared/chat'
import { createUseStepChange } from '@orbit/shared/hooks/step-change-core'
import type { Question } from '@orbit/shared/types/question-block'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const useStepChange = createUseStepChange({ useEffect, useRef })

/** With the guided flows on, a block of several questions shows one question at a time. */
export function useQuestionInView(questions: readonly Question[], state: QuestionBlockState) {
  const enabled = questions.length > 1
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

/**
 * When the question in view changes, screen reader focus moves to the new question. The previous and next controls then never hold focus while they turn disabled.
 * The returned callback ref goes on the text that names the shown question: the prompt in the panel, or the title of the frame when the first question has no prompt of its own.
 * The step key is the index alone: a flag that turns on after the first render is the baseline, never a move of the question.
 */
export function useFocusQuestionInView(enabled: boolean, index: number): (node: Text | null) => void {
  const anchor = useRef<Text | null>(null)
  const setAnchor = useCallback((node: Text | null) => { anchor.current = node }, [])
  useStepChange(String(index), () => {
    if (!enabled) return
    const handle = findNodeHandle(anchor.current)
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle)
  })
  return setAnchor
}

/**
 * The title of the frame of a block with no title of its own, while one question shows at a time: the prompt of question 1.
 * Question 1 shows no prompt in its panel then, so this text is the focus anchor while question 1 is in view. A question that is invalid shows its own prompt and keeps the anchor.
 */
export function questionFrameTitle({ inView, blockTitle, first, invalidIds, anchor, color }: Readonly<{ inView: { enabled: boolean; index: number }; blockTitle: string | undefined; first: Question; invalidIds: readonly string[]; anchor: (node: Text | null) => void; color: string }>): ReactNode {
  if (!inView.enabled || blockTitle) return undefined
  const anchored = inView.index === 0 && !invalidIds.includes(first.id)
  return <Text ref={anchored ? anchor : undefined} style={{ fontFamily: 'Geist_500Medium', fontSize: 16, color }}>{first.prompt}</Text>
}

/** The previous control, the position of the question in view, and the next control. */
export function QuestionInViewNav({ index, total, onMove }: Readonly<{ index: number; total: number; onMove: (step: -1 | 1) => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View testID="question-in-view" style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
    <IconButton label={t('chat.question.previous')} disabled={index === 0} onClick={() => onMove(-1)}><ChevronLeft size={20} accessible={false} /></IconButton>
    <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{t('chat.choice.position', { position: index + 1, total })}</Text>
    <IconButton label={t('chat.question.next')} disabled={index === total - 1} onClick={() => onMove(1)}><ChevronRight size={20} accessible={false} /></IconButton>
  </View>
}

/** The counters above the questions: the position of the block in its sequence, then the answered count. While the in-view navigation shows, `answered` is null, because the position of the navigation says it. */
export function QuestionCounters({ progress, answered, total, color }: Readonly<{ progress?: { current: number; total: number }; answered: number | null; total: number; color: string }>) {
  const { t } = useTranslation()
  if (!progress && answered === null) return null
  return <View style={{ minWidth: 0, gap: 4 }}>
    {progress ? <Text style={{ fontSize: 14, lineHeight: 20, color }}>{t('chat.choice.position', { position: progress.current, total: progress.total })}</Text> : null}
    {answered === null ? null : <Text style={{ fontSize: 14, lineHeight: 20, color }}>{t('chat.question.progress', { answered, total })}</Text>}
  </View>
}
