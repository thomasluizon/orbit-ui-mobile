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

function getBodyStyle(compact: boolean, hasAction: boolean, inset: boolean) {
  if (!inset) return { minHeight: 'var(--row-h-compact)', paddingBlock: 4, paddingInlineStart: 0, paddingInlineEnd: 0 }
  return compact
    ? { minHeight: 52, padding: '4px 12px', paddingInlineEnd: hasAction ? 0 : 12 }
    : { minHeight: 76, padding: 16, paddingInlineEnd: hasAction ? 0 : 16 }
}

function RowBody({ title, titleTranslate, wrapTitle, description, icon, value, wrapValue, danger, trailing }: Readonly<Pick<WebListRowProps, 'title' | 'titleTranslate' | 'wrapTitle' | 'description' | 'icon' | 'value' | 'wrapValue' | 'danger' | 'trailing'>>) {
  const rowColors = { iconColor: danger ? 'var(--status-bad)' : 'var(--fg-1)' }
  const titleColor = danger ? 'var(--status-bad-text)' : 'var(--fg-1)'
  return (
    <>
      {icon ? (
        <span style={{ width: 28, flexShrink: 0, color: rowColors.iconColor }}>
          {typeof icon === 'string' ? <Icon name={icon} size={24} color={rowColors.iconColor} /> : icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span translate={titleTranslate} className={wrapTitle ? 'break-words' : 'truncate'} style={{ color: titleColor, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 400, lineHeight: 1.25 }}>{title}</span>
        {description ? <span style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
      </span>
      {value ? <span className={`max-w-[50%] shrink-0 ${wrapValue ? 'break-words' : 'truncate'}`} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span> : null}
      {trailing ? <span className="flex shrink-0 items-center px-2">{trailing}</span> : null}
    </>
  )
}

export function ListRow(props: Readonly<WebListRowProps>) {
  const { accessibilityLabel, action, chevron = true, compact = false, inset = true, disabled = false, href, inForm = false, onClick, readOnly = false } = props
  const body: ReactNode = <RowBody {...props} />
  const content = <span className="flex min-w-0 flex-1 items-center" style={{ minHeight: 44, gap: 12 }}>{body}{!readOnly && chevron ? <span className="flex shrink-0 items-center justify-center" style={{ width: 44, height: 44 }}><ChevronRight size={24} color="var(--fg-3)" strokeWidth={1.8} /></span> : null}</span>
  const bodyStyle = getBodyStyle(compact, !!action, inset)

  return (
    <div className={`orbit-list-row-shell flex items-stretch ${inForm ? 'orbit-list-row-form' : ''}`} style={{ minHeight: 52 }}>
      {readOnly || (!href && !onClick) ? (
        <div className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{content}</div>
      ) : href && !disabled ? (
        <Link href={href} aria-label={accessibilityLabel} onClick={onClick} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] text-left no-underline" style={bodyStyle}>{content}</Link>
      ) : (
        <button type="button" aria-label={accessibilityLabel} onClick={onClick} disabled={disabled} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] border-0 bg-transparent text-left disabled:cursor-default disabled:opacity-50" style={bodyStyle}>{content}</button>
      )}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="orbit-list-row-action flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent active:scale-[0.96]" style={{ margin: 16, marginInlineStart: 0 }}>
          <span className="flex shrink-0 items-center justify-center" style={{ width: 44, height: 44 }}>
            <Icon name={action.icon} size={20} color={action.danger ? 'var(--status-bad)' : 'var(--fg-2)'} />
          </span>
        </button>
      ) : null}
    </div>
  )
}
