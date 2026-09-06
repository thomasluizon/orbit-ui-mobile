'use client'

import type { ReactNode } from 'react'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'

function RowBody({ title, description, icon, value, danger, trailing }: Readonly<Pick<ListRowProps, 'title' | 'description' | 'icon' | 'value' | 'danger' | 'trailing'>>) {
  const color = danger ? 'var(--status-bad)' : 'var(--fg-1)'
  return (
    <>
      {icon ? (
        <span style={{ width: 28, flexShrink: 0, color }}>
          {typeof icon === 'string' ? <Icon name={icon} size={24} color={color} /> : icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span className="truncate" style={{ color, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 400, lineHeight: 1.25 }}>{title}</span>
        {description ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
      </span>
      {value ? <span className="max-w-[50%] shrink-0 truncate" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span> : null}
      {trailing ? <span className="flex shrink-0 items-center px-2">{trailing}</span> : null}
    </>
  )
}

export function ListRow(props: Readonly<ListRowProps>) {
  const { action, chevron = true, onClick, readOnly = false } = props
  const body: ReactNode = <RowBody {...props} />
  const content = <span className={`flex min-w-0 flex-1 items-center ${!readOnly && onClick ? 'orbit-list-row group-active/list-body:scale-[0.96]' : ''}`} style={{ minHeight: 44, gap: 12 }}>{body}{!readOnly && chevron ? <span className="flex shrink-0 items-center justify-center" style={{ width: 44, height: 44 }}><ChevronRight size={24} color="var(--fg-4)" strokeWidth={1.8} /></span> : null}</span>
  const bodyStyle = { minHeight: 76, padding: 16, paddingInlineEnd: action ? 0 : 16 } as const

  return (
    <div className="flex items-stretch" style={{ minHeight: 52 }}>
      {readOnly || !onClick ? (
        <div className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{content}</div>
      ) : (
        <button type="button" onClick={onClick} className="orbit-list-row-body group/list-body flex min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent text-left" style={bodyStyle}>{content}</button>
      )}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="orbit-list-row-action group/list-action flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent" style={{ padding: 16, paddingInlineStart: 0, color: action.danger ? 'var(--status-bad)' : 'var(--fg-2)' }}>
          <span className="habit-control-motion flex shrink-0 items-center justify-center rounded-full group-hover/list-action:bg-[var(--bg-hover)] group-active/list-action:scale-[0.96]" style={{ width: 44, height: 44 }}>
            <Icon name={action.icon} size={20} color="currentColor" />
          </span>
        </button>
      ) : null}
    </div>
  )
}
