'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import type { MouseEventHandler, ReactNode } from 'react'
import Link from 'next/link'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'

type WebListRowProps = Omit<ListRowProps, 'onClick'> & {
  onClick?: MouseEventHandler<HTMLElement>
  titleTranslate?: 'no'
}

function getBodyPadding(compact: boolean, hasTrailing: boolean) {
  return compact && hasTrailing ? 0 : 4
}

function getBodyStyle(compact: boolean, hasAction: boolean, inset: boolean, hasDescription: boolean, compactForm: boolean, hasTrailing: boolean) {
  const paddingBlock = getBodyPadding(compact, hasTrailing)
  if (!inset) return { minHeight: 'var(--row-h-compact)', paddingBlock, paddingInlineStart: 0, paddingInlineEnd: 0 }
  return compact
    ? { minHeight: 'var(--row-h-compact)', paddingBlock, paddingInline: compactForm ? 12 : 16, paddingInlineEnd: hasAction ? 0 : compactForm ? 12 : 16 }
    : { minHeight: hasDescription ? 76 : 56, paddingBlock: hasDescription ? 16 : 4, paddingInline: 16, paddingInlineEnd: hasAction ? 0 : 16 }
}

function getActionStyle(compact: boolean, inset: boolean, compactForm: boolean, hasDescription: boolean) {
  return { marginBlock: !compact && inset && hasDescription ? 16 : 4, marginInlineEnd: inset ? compactForm ? 12 : 16 : 0, marginInlineStart: 0, alignSelf: 'center' as const }
}

function descriptionClass(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle']) {
  if (textMode === 'personal') return 'line-clamp-2 break-all'
  return wrapTitle ? 'break-words' : undefined
}

function titleLineHeight(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle']) {
  return textMode === 'label' || wrapTitle ? 1.4 : 1.25
}

function textBlockStyle(textMode: WebListRowProps['textMode'], wrapValue: WebListRowProps['wrapValue'], wrapTitle: WebListRowProps['wrapTitle'], compact: boolean, hasTrailing: boolean) {
  return { gap: 4, ...(compact && hasTrailing ? { paddingBlock: 4 } : {}), ...(wrapTitle && hasTrailing ? { minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' } : {}), ...(wrapValue ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%' } : textMode === 'label' ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%', minHeight: 24, justifyContent: 'center' } : {}) }
}

function RowText({ title, textMode, titleTranslate, wrapTitle, description, wrapValue, danger, trailing, compact = !description }: Readonly<Pick<WebListRowProps, 'title' | 'textMode' | 'titleTranslate' | 'wrapTitle' | 'description' | 'wrapValue' | 'danger' | 'trailing' | 'compact'>>) {
  const titleColor = danger ? 'var(--status-bad-text)' : 'var(--fg-1)'
  return <span className="flex min-w-0 flex-1 flex-col" style={textBlockStyle(textMode, wrapValue, wrapTitle, compact, !!trailing)}>
    <span data-slot="list-row-title" translate={titleTranslate} className={textMode === 'personal' ? 'line-clamp-2 break-all' : textMode === 'label' ? 'break-words' : wrapTitle ? 'break-words' : 'truncate'} style={{ color: titleColor, fontFamily: 'var(--font-sans)', fontSize: textMode === 'personal' ? '1.0625rem' : 17, fontWeight: 400, lineHeight: titleLineHeight(textMode, wrapTitle) }}>{title}</span>
    {description ? <span className={descriptionClass(textMode, wrapTitle)} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', fontFamily: 'var(--font-sans)', fontSize: textMode === 'personal' ? '0.75rem' : 14, lineHeight: 1.4 }}>{description}</span> : null}
  </span>
}

function RowValue({ value, textMode, wrapValue }: Readonly<Pick<WebListRowProps, 'value' | 'textMode' | 'wrapValue'>>) {
  if (!value) return null
  return <span data-slot="list-row-value" className={`t-meta shrink-0 ${textMode === 'label' ? 'max-w-full break-words' : wrapValue ? 'max-w-full break-words' : 'max-w-[50%] truncate'}`} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', lineHeight: 1.4 }}>{value}</span>
}

function getContentStyle(textMode: WebListRowProps['textMode'], hasWrappedControl: boolean) {
  return textMode === 'label' || hasWrappedControl
    ? { minHeight: 24, gap: 12, alignItems: 'flex-start' }
    : { minHeight: 24, gap: 12 }
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
  const content = <span className="flex min-w-0 flex-1 items-center" style={getContentStyle(props.textMode, !!props.wrapTitle && !!props.trailing)}>{body}{!readOnly && chevron ? <span className="flex shrink-0 items-center justify-center" style={props.textMode ? { width: 24, minHeight: 24 } : { width: TOUCH_TARGET_MIN, height: 24 }}><ChevronRight aria-hidden="true" focusable="false" size={24} color="var(--fg-3)" strokeWidth={1.8} /></span> : null}</span>
  const compactForm = inForm && props.compact === true
  const bodyStyle = getBodyStyle(compact, !!action, inset, !!props.description, compactForm, !!props.trailing)

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
        <button type="button" aria-label={action.label} onClick={action.onPress} className="orbit-list-row-action flex size-[var(--touch-min)] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent active:scale-[0.96]" style={getActionStyle(compact, inset, compactForm, !!props.description)}>
          <span className="flex shrink-0 items-center justify-center" style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN }}>
            <Icon name={action.icon} size={20} color={action.danger ? 'var(--status-bad)' : 'var(--fg-2)'} />
          </span>
        </button>
      ) : null}
    </div>
  )
}
