'use client'

import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AnswerBlockController, getAnswerBlockView, type AnswerBlockProps, type AnswerBlockView, type AnswerBlockState } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'
import { CheckRow } from '@/components/ui/check-row'
import { Proposed } from '@/components/ui/proposed'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/pill-button'
import { Check, Lock, ArrowUp } from '@/components/ui/icons'

type AnswerContentProps = Readonly<{
  view: AnswerBlockView
  state: AnswerBlockState
  controller: AnswerBlockController
  submit: () => Promise<void>
}>

function AnswerOptions({ view, controller }: Pick<AnswerContentProps, 'view' | 'controller'>) {
  const contentId = useId()
  return view.options.map((option, index) => view.single
    ? <RadioRow selection hideMeta wrapLabel key={option.id} label={option.label} description={option.description}
        meta={option.position} selected={option.selected} onSelect={() => controller.select(option.id)}
        {...(view.disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const })} />
    : <Proposed key={option.id} proposed={option.proposed} scope="row" label={view.proposedLabel} inset keepMounted>
        <CheckRow selection wrapLabel textMode={option.personal ? 'personal' : undefined} label={option.label} description={option.description}
          onOpenLabel={option.personal ? () => controller.toggleExpanded(option.id) : undefined} labelExpanded={option.personal ? option.expanded : undefined} labelControls={`${contentId}-${index}`}
          proposed={option.proposed} checked={option.selected} disabled={view.disabled} onChange={checked => controller.check(option.id, checked)} />
      </Proposed>)
}

function AnswerBody({ view, state, controller, submit }: AnswerContentProps) {
  return <div className="flex min-w-0 flex-col gap-4">
    {view.single ? <RadioGroup aria-label={view.title} onKeyDown={event => {
      if (event.key === 'Enter' && state.selectedIds.length) { event.preventDefault(); void submit() }
    }}><AnswerOptions view={view} controller={controller} /></RadioGroup> : <div role="group" aria-label={view.title}><AnswerOptions view={view} controller={controller} /></div>}
    {view.freeTextLabel ? <Input label={view.freeTextLabel} value={state.freeText} onChange={controller.setFreeText} maxLength={500} disabled={view.disabled} onSubmit={() => void submit()} /> : null}
  </div>
}

function AnswerSubmit({ view, submit }: Pick<AnswerContentProps, 'view' | 'submit'>) {
  return <div className="flex w-full min-w-0 flex-col items-end gap-2">
    <Button variant="ghost" size="sm" loading={view.acting} disabled={view.submitDisabled}
      leadingIcon={<ArrowUp size={20} aria-hidden="true" />} onClick={() => void submit()}>{view.submitLabel}</Button>
    <p aria-live="polite" aria-atomic="true" role={view.statusError ? 'alert' : 'status'} className={view.statusError ? "text-sm text-[var(--status-bad-text)]" : "text-sm text-[var(--fg-3)]"}>{view.status}</p>
  </div>
}

function TerminalAnswer({ text, answered, focus }: Readonly<{ text: string; answered: boolean; focus: boolean }>) {
  const focusLine = useCallback((element: HTMLParagraphElement | null) => {
    if (element && focus) element.focus({ preventScroll: true })
  }, [focus])
  const Glyph = answered ? Check : Lock
  return <p tabIndex={-1} ref={focusLine} className="flex min-w-0 items-start gap-2 text-sm text-[var(--fg-3)]" style={{ outlineWidth: 0 }}>
    <Glyph aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0" />
    <span className="min-w-0 break-words">{text}</span>
  </p>
}

export function AnswerBlock(props: AnswerBlockProps) {
  const locale = useLocale()
  const t = useTranslations('chat.choice')
  const [controller] = useState(() => new AnswerBlockController(props))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const view = getAnswerBlockView(props, state, t)
  const submit = () => controller.submit(props, t, locale)

  return <div className="min-w-0" data-answer-block={props.definition.kind}>
    {view.closed ? <TerminalAnswer text={view.closed} answered={view.answered} focus={controller.focusWhenClosed} /> : <BlockFrame state={view.acting ? 'acting' : 'resting'} title={view.title} wrapTitle items={[]}
      body={<AnswerBody view={view} state={state} controller={controller} submit={submit} />}
      actions={<AnswerSubmit view={view} submit={submit} />} />}
  </div>
}
