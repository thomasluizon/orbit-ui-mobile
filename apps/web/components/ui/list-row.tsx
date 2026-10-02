'use client'

import type { MouseEventHandler, ReactNode } from 'react'
import Link from 'next/link'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'

type WebListRowProps = Omit<ListRowProps, 'onClick'> & {
  onClick?: MouseEventHandler<HTMLElement>
  titleTranslate?: 'no'
}

function getBodyStyle(compact: boolean, hasAction: boolean, inset: boolean, hasDescription: boolean, compactForm: boolean) {
  if (!inset) return { minHeight: 'var(--row-h-compact)', paddingBlock: 4, paddingInlineStart: 0, paddingInlineEnd: 0 }
  return compact
    ? { minHeight: 'var(--row-h-compact)', paddingBlock: 4, paddingInline: compactForm ? 12 : 16, paddingInlineEnd: hasAction ? 0 : compactForm ? 12 : 16 }
    : { minHeight: hasDescription ? 76 : 56, paddingBlock: hasDescription ? 16 : 4, paddingInline: 16, paddingInlineEnd: hasAction ? 0 : 16 }
}

function getActionStyle(compact: boolean, inset: boolean, compactForm: boolean, hasDescription: boolean) {
  return { marginBlock: !compact && inset && hasDescription ? 16 : 4, marginInlineEnd: inset ? compactForm ? 12 : 16 : 0, marginInlineStart: 0, alignSelf: 'center' as const }
}

function descriptionClass(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle']) {
  if (textMode === 'personal') return 'line-clamp-2 break-all'
  return wrapTitle ? 'break-words' : undefined
}

function RowText({ title, textMode, titleTranslate, wrapTitle, description, wrapValue, danger }: Readonly<Pick<WebListRowProps, 'title' | 'textMode' | 'titleTranslate' | 'wrapTitle' | 'description' | 'wrapValue' | 'danger'>>) {
  const titleColor = danger ? 'var(--status-bad-text)' : 'var(--fg-1)'
  return <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4, ...(wrapValue ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%' } : textMode === 'label' ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%', minHeight: 24, justifyContent: 'center' } : {}) }}>
    <span data-slot="list-row-title" translate={titleTranslate} className={textMode === 'personal' ? 'line-clamp-2 break-all' : textMode === 'label' ? 'break-words' : wrapTitle ? 'break-words' : 'truncate'} style={{ color: titleColor, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 400, lineHeight: 1.25 }}>{title}</span>
    {description ? <span className={descriptionClass(textMode, wrapTitle)} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', fontFamily: 'var(--font-sans)', fontSize: textMode === 'personal' ? 12 : 14, lineHeight: 1.4 }}>{description}</span> : null}
  </span>
}

function RowValue({ value, textMode, wrapValue }: Readonly<Pick<WebListRowProps, 'value' | 'textMode' | 'wrapValue'>>) {
  if (!value) return null
  return <span data-slot="list-row-value" className={`t-meta shrink-0 ${textMode === 'label' ? 'max-w-full break-words' : wrapValue ? 'max-w-full break-words' : 'max-w-[50%] truncate'}`} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', lineHeight: 1.4 }}>{value}</span>
}

function getContentStyle(textMode: WebListRowProps['textMode']) {
  return textMode === 'label'
    ? { minHeight: 24, gap: 12, alignItems: 'flex-start' }
    : { minHeight: 44, gap: 12 }
}

function RowBody(props: Readonly<WebListRowProps>) {
  const { textMode, icon, wrapValue, danger, trailing } = props
  const rowColors = { iconColor: danger ? 'var(--status-bad)' : 'var(--fg-1)' }
  const rowValue = <RowValue {...props} />
  const rowTrailing = trailing ? <span className="flex shrink-0 items-center px-2">{trailing}</span> : null
  return (
    <>
      {icon ? (
        <span aria-hidden="true" style={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0, color: rowColors.iconColor }}>
          {typeof icon === 'string' ? <Icon name={icon} size={24} color={rowColors.iconColor} /> : icon}
        </span>
      ) : null}
      {wrapValue || textMode === 'label' ? <span className="flex min-w-0 flex-1 flex-wrap items-center" style={{ gap: 12, ...(textMode === 'label' ? { alignItems: 'flex-start' } : {}) }}>{<RowText {...props} />}{rowValue}{textMode === 'label' ? rowTrailing : null}</span> : <>{<RowText {...props} />}{rowValue}</>}
      {textMode !== 'label' ? rowTrailing : null}
    </>
  )
}

export function ListRow(props: Readonly<WebListRowProps>) {
  const { accessibilityLabel, expanded, controls, action, chevron = true, compact = !props.description, inset = true, disabled = false, href, inForm = false, onClick, readOnly = false } = props
  const body: ReactNode = <RowBody {...props} />
  const content = <span className="flex min-w-0 flex-1 items-center" style={getContentStyle(props.textMode)}>{body}{!readOnly && chevron ? <span className="flex shrink-0 items-center justify-center" style={props.textMode ? { width: 24, minHeight: 24 } : { width: 44, height: 44 }}><ChevronRight size={24} color="var(--fg-3)" strokeWidth={1.8} /></span> : null}</span>
  const compactForm = inForm && props.compact === true
  const bodyStyle = getBodyStyle(compact, !!action, inset, !!props.description, compactForm)

  return (
    <div className={`orbit-list-row-shell flex items-stretch ${inForm ? 'orbit-list-row-form' : ''}`} style={{ minHeight: 52 }}>
      {readOnly || (!href && !onClick) ? (
        <div className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{content}</div>
      ) : href && !disabled ? (
        <Link href={href} aria-label={accessibilityLabel} aria-expanded={expanded} aria-controls={controls} onClick={onClick} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] text-left no-underline" style={bodyStyle}>{content}</Link>
      ) : (
        <button type="button" aria-label={accessibilityLabel} aria-expanded={expanded} aria-controls={controls} onClick={onClick} disabled={disabled} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] border-0 bg-transparent text-left disabled:cursor-default disabled:opacity-50" style={bodyStyle}>{content}</button>
      )}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="orbit-list-row-action flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent active:scale-[0.96]" style={getActionStyle(compact, inset, compactForm, !!props.description)}>
          <span className="flex shrink-0 items-center justify-center" style={{ width: 44, height: 44 }}>
            <Icon name={action.icon} size={20} color={action.danger ? 'var(--status-bad)' : 'var(--fg-2)'} />
          </span>
        </button>
      ) : null}
    </div>
  )
}
