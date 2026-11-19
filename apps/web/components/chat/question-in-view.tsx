'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { followQuestionInView, moveQuestionInView, startQuestionInView, type QuestionBlockState } from '@orbit/shared/chat'
import { createUseStepChange } from '@orbit/shared/hooks/step-change-core'
import type { Question } from '@orbit/shared/types/question-block'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useFlag } from '@/hooks/use-flag'

const useStepChange = createUseStepChange({ useEffect, useRef })

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

/**
 * When the question in view changes, focus moves to the new question, so its name is read and the previous and next controls never hold focus while they turn disabled.
 * The step key is the index alone: a flag that turns on after the first render is the baseline, never a move of the question.
 */
export function useFocusQuestionInView(root: RefObject<HTMLElement | null>, enabled: boolean, index: number): void {
  useStepChange(String(index), () => {
    if (enabled) root.current?.querySelector<HTMLElement>('fieldset')?.focus()
  })
}

/** The previous control, the position of the question in view, and the next control. */
export function QuestionInViewNav({ index, total, onMove }: Readonly<{ index: number; total: number; onMove: (step: -1 | 1) => void }>) {
  const t = useTranslations()
  return <div className="flex min-w-0 items-center justify-between gap-2">
    <IconButton label={t('chat.question.previous')} disabled={index === 0} onClick={() => onMove(-1)}><ChevronLeft size={20} aria-hidden="true" /></IconButton>
    <p role="status" className="text-sm text-[var(--fg-3)]">{t('chat.choice.position', { position: index + 1, total })}</p>
    <IconButton label={t('chat.question.next')} disabled={index === total - 1} onClick={() => onMove(1)}><ChevronRight size={20} aria-hidden="true" /></IconButton>
  </div>
}

/** The counters above the questions: the position of the block in its sequence, then the answered count. While the in-view navigation shows, `answered` is null, because the position of the navigation says it. */
export function QuestionCounters({ progress, answered, total }: Readonly<{ progress?: { current: number; total: number }; answered: number | null; total: number }>) {
  const t = useTranslations()
  if (!progress && answered === null) return null
  return <div className="flex min-w-0 flex-col gap-1 text-sm text-[var(--fg-3)]">
    {progress ? <p>{t('chat.choice.position', { position: progress.current, total: progress.total })}</p> : null}
    {answered === null ? null : <p>{t('chat.question.progress', { answered, total })}</p>}
  </div>
}
