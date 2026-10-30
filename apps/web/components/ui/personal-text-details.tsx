'use client'

import { SPACING } from '@orbit/shared/theme'


import { useCallback, useId, useState, type ComponentProps, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

const Sheet = dynamic(() => import('@/components/ui/sheet').then((module) => module.Sheet), { loading: () => null })

function outsetPresentation(outset: boolean) {
  if (outset) return { className: '-mx-[8px]', textStyle: { paddingInline: SPACING.s0 } }
  return { className: '', textStyle: undefined }
}

function DetailsText({ children, lines, expanded, contentId, style, onClampedChange }: Readonly<{ children: string; lines: 1 | 2; expanded: boolean; contentId: string; style?: CSSProperties; onClampedChange: (clamped: boolean) => void }>) {
  return <div className="relative min-w-0 flex-1">
    <div aria-hidden={expanded || undefined} style={expanded ? { position: 'absolute', width: '100%', visibility: 'hidden', pointerEvents: 'none' } : undefined}><PersonalText lines={lines} id={expanded ? undefined : contentId} onClampedChange={onClampedChange} style={style}>{children}</PersonalText></div>
    {expanded ? <PersonalText id={contentId} expanded style={style}>{children}</PersonalText> : null}
  </div>
}

function InlineDetails({ clamped, ...props }: Readonly<ComponentProps<typeof PersonalTextAction> & { clamped: boolean }>) {
  if (clamped) return <PersonalTextAction {...props} />
  return <div className={`${props.className} ${props.contentClassName}`} style={props.contentStyle}>{props.control.props.children}</div>
}

function useTextDisclosure(children: string) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const [text, setText] = useState(children)
  if (text !== children) {
    setText(children)
    setClamped(false)
    setExpanded(false)
  }
  const measureClamped = useCallback((next: boolean) => {
    setClamped(next)
    if (!next) setExpanded(false)
  }, [])
  return { expanded, setExpanded, clamped, measureClamped }
}

export function PersonalTextDetails({ children, textStyle, lines = 2, iconOnly = false, proposed = false, outset = false, clamped: labelClamped = false }: Readonly<{ children: string; textStyle?: CSSProperties; lines?: 1 | 2; iconOnly?: boolean; proposed?: boolean; outset?: boolean; clamped?: boolean }>) {
  const t = useTranslations()
  const { expanded, setExpanded, clamped, measureClamped } = useTextDisclosure(children)
  const canDisclose = iconOnly ? labelClamped : clamped
  const contentId = useId()
  const presentation = outsetPresentation(outset)
  const contentStyle = { ...textStyle, borderRadius: lines === 1 ? 8 : undefined, color: proposed ? 'var(--fg-3)' : textStyle?.color }
  const contentClassName = "flex min-h-[48px] min-w-0 w-full items-center gap-[8px] rounded-[12px] px-2 py-1 text-start"
  const content = <>
    {!iconOnly ? <DetailsText lines={lines} expanded={expanded} contentId={contentId} onClampedChange={measureClamped} style={presentation.textStyle}>{children}</DetailsText> : null}
    {canDisclose ? <ChevronDown aria-hidden="true" size={20} strokeWidth={2} className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} /> : null}
  </>
  const control = <button type="button" aria-label={iconOnly ? t('common.showFullText', { name: children }) : children} aria-expanded={expanded} aria-controls={contentId} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }} onClick={() => setExpanded(!expanded)} style={contentStyle} className="orbit-hover-text orbit-personal-text-details flex min-h-[48px] min-w-[48px] w-full items-center gap-[8px] rounded-[12px] px-2 py-1 text-start touch-manipulation hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] hover:[--fg-3:var(--fg-2)] active:[--fg-3:var(--fg-2)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">
      {content}
    </button>
  const visibleControl = canDisclose ? control : null
  if (iconOnly && !canDisclose && !expanded) return null
  return <div className={iconOnly ? 'shrink-0 min-w-[48px]' : 'min-w-0 w-full'}>
    {!iconOnly ? <InlineDetails clamped={canDisclose} className={`${presentation.className} focus-within:[--fg-3:var(--fg-2)]`} label={children} contentClassName={contentClassName} contentStyle={contentStyle} control={control} /> : visibleControl}
    {iconOnly && expanded ? <Sheet onClose={() => setExpanded(false)} title={children} titleMode="typed"><div id={contentId}><PersonalText expanded>{children}</PersonalText></div></Sheet> : null}
  </div>
}
