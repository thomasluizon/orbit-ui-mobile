'use client'

import type { PreviewItemTitleProps } from '@orbit/shared/chat'
import { usePreviewTitle } from '@/hooks/use-preview-title'
import { Input } from '@/components/ui/input'
import { PersonalText } from '@/components/ui/personal-text'

export function PreviewItemTitle(props: Readonly<PreviewItemTitleProps>) {
  const title = usePreviewTitle(props)
  const content = <>{props.icon ? <span aria-hidden="true" className="shrink-0">{props.icon}</span> : null}<PersonalText>{props.title}</PersonalText></>
  if (title.editing && props.rename) return <Input hideLabel autoFocus label={props.rename.label} value={title.draft} onChange={title.setDraft} onSubmit={() => void title.save()} onBlur={() => void title.save()} onCancel={title.cancel} disabled={props.rename.disabled} />
  const className = 'flex min-h-[var(--touch-min)] min-w-0 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start'
  if (!props.rename) return <div className="-mx-2"><div className={className}>{content}</div></div>
  return <div className="-mx-2"><button type="button" aria-label={props.title} disabled={props.rename.disabled} onClick={title.start} className={`${className} transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)] disabled:opacity-40`} style={{ color: props.proposed ? 'var(--fg-3)' : undefined }}>{content}</button></div>
}
