'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { followQuestionInView, moveQuestionInView, startQuestionInView, type QuestionBlockState } from '@orbit/shared/chat'
import type { Question } from '@orbit/shared/types/question-block'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useFlag } from '@/hooks/use-flag'

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
  const t = useTranslations()
  return <div className="flex min-w-0 items-center justify-between gap-2">
    <IconButton label={t('chat.question.previous')} disabled={index === 0} onClick={() => onMove(-1)}><ChevronLeft size={20} aria-hidden="true" /></IconButton>
    <p className="text-sm text-[var(--fg-3)]">{t('chat.choice.position', { position: index + 1, total })}</p>
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
