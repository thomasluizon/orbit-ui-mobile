'use client'

import type { PreviewItemTitleProps } from '@orbit/shared/chat'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { usePreviewTitle } from '@/hooks/use-preview-title'
import { Input } from '@/components/ui/input'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

export function PreviewItemTitle(props: Readonly<PreviewItemTitleProps>) {
  const title = usePreviewTitle(props)
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const controlRef = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (!title.editing && title.restoreFocus) controlRef.current?.focus()
  }, [title.editing, title.restoreFocus])
  const content = <>{props.icon ? <span aria-hidden="true" className="shrink-0">{props.icon}</span> : null}<PersonalText expanded={!props.rename && expanded}>{props.title}</PersonalText></>
  if (title.editing && props.rename) return <Input hideLabel autoFocus label={props.rename.label} value={title.draft} onChange={title.setDraft} onSubmit={() => void title.save(true)} onBlur={() => void title.save()} onCancel={title.cancel} disabled={props.rename.disabled} />
  const className = 'flex min-h-[var(--touch-min)] min-w-0 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start'
  return <PersonalTextAction contentId={contentId} label={props.title} className="-mx-2 focus-within:[--fg-3:var(--fg-2)]" contentClassName={className} contentStyle={{ color: props.proposed ? 'var(--fg-3)' : undefined }} control={<button ref={controlRef} type="button" aria-label={props.title} aria-expanded={!props.rename ? expanded : undefined} aria-controls={!props.rename ? contentId : undefined} disabled={props.rename?.disabled} onClick={props.rename ? title.start : () => setExpanded(!expanded)} className={`${className} transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)] disabled:opacity-40`}>{content}</button>} />
}
