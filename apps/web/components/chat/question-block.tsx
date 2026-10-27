'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { QuestionBlockController, questionBlockStatus, type QuestionBlockProps, type QuestionWords } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { IconButton } from '@/components/ui/icon-button'
import { ArrowUp, Check, Lock } from '@/components/ui/icons'
import { blockDesktopWebReload } from '@/lib/web-reload-state'
import { QuestionControls } from './question-controls'

export function QuestionBlock(props: QuestionBlockProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [focusWhenClosed] = useState(() => !props.expired && !props.savedAnswer)
  const [controller] = useState(() => new QuestionBlockController())
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const root = useRef<HTMLDivElement>(null)
  const words: QuestionWords = { yes: t('common.yes'), no: t('common.no'), answered: options => t('chat.choice.answered', { options }),
    closed: t('chat.choice.closed'), alreadyAnswered: t('chat.choice.alreadyAnswered'), invalid: t('chat.choice.invalid'), error: t('chat.choice.error'),
    offline: t('chat.choice.offline'), limit: t('chat.choice.limit', { allowance: props.interaction?.allowance ?? 0 }), acting: t('chat.choice.acting') }
  const view = questionBlockStatus(props, state, words)
  const pending = !view.closed && (state.acting || Object.keys(state.answers).length > 0)
  useEffect(() => { if (pending) return blockDesktopWebReload() }, [pending])
  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('[data-question-invalid="true"]')
    first?.querySelector<HTMLElement>('button, input, [role="slider"]')?.focus()
  }, [state.invalidIds])
  const focusClosed = useCallback((element: HTMLParagraphElement | null) => {
    if (element && focusWhenClosed) element.focus({ preventScroll: true })
  }, [focusWhenClosed])
  const Glyph = view.answered ? Check : Lock
  const controlWords = { yes: words.yes, no: words.no, recommended: t('chat.placement.recommended'), freeText: t('chat.choice.freeText'), required: t('common.required') }
  return <div ref={root} className="min-w-0" data-answer-block="question">
    {view.closed ? <p ref={focusClosed} tabIndex={-1} className="flex min-w-0 items-start gap-2 text-sm text-[var(--fg-3)]" style={{ outlineWidth: 0 }}>
      <Glyph size={20} aria-hidden="true" className="shrink-0" /><span className="min-w-0 break-words">{view.closed}</span>
    </p> : <BlockFrame state={state.acting ? 'acting' : 'resting'} title={props.block.title || props.block.questions[0]!.prompt} wrapTitle items={[]}
      body={<div className="flex min-w-0 flex-col gap-6">
        {props.block.intro ? <p className="break-words text-base text-[var(--fg-2)]">{props.block.intro}</p> : null}
        <div className="flex min-w-0 flex-col gap-1 text-sm text-[var(--fg-3)]">
          {props.block.progress ? <p>{t('chat.choice.position', { position: props.block.progress.current, total: props.block.progress.total })}</p> : null}
          <p>{t('chat.question.progress', { answered: view.completed, total: props.block.questions.length })}</p>
        </div>
        {props.block.questions.map((question, index) => {
          const invalid = state.invalidIds.includes(question.id)
          const hintId = `${props.block.blockId}-${question.id}-hint`
          return <fieldset key={question.id} data-question-invalid={invalid} aria-invalid={invalid} aria-describedby={invalid ? hintId : undefined} aria-label={question.prompt}
            className="flex min-w-0 flex-col gap-3 border-0 p-0">
            {props.block.title || index > 0 ? <legend className="w-full break-words pb-3 text-base font-medium text-[var(--fg-1)]">{question.prompt}</legend> : null}
            <QuestionControls question={question} answer={state.answers[question.id]} disabled={view.disabled} controller={controller} words={controlWords} />
            <p id={hintId} className="break-words text-sm text-[var(--status-bad-text)]">{invalid ? t('chat.question.required') : ''}</p>
          </fieldset>
        })}
      </div>}
      actions={<div className="flex w-full min-w-0 flex-col items-end gap-2">
        <IconButton label={t('chat.choice.submit')} loading={state.acting} disabled={view.submitDisabled} onClick={() => void controller.submit(props, words, locale)}><ArrowUp size={20} aria-hidden="true" /></IconButton>
        <p aria-live="polite" aria-atomic="true" role={view.statusError ? 'alert' : 'status'} className={view.statusError ? 'text-sm text-[var(--status-bad-text)]' : 'text-sm text-[var(--fg-3)]'}>{view.status}</p>
      </div>} />}
  </div>
}
