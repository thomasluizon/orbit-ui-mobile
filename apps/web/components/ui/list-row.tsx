'use client'

import type { ReactNode } from 'react'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'

function RowBody({ title, description, icon, value, danger }: Readonly<Pick<ListRowProps, 'title' | 'description' | 'icon' | 'value' | 'danger'>>) {
  const color = danger ? 'var(--status-bad)' : 'var(--fg-1)'
  return (
    <>
      {icon ? <span style={{ width: 28, flexShrink: 0, color }}><Icon name={icon} size={24} color={color} /></span> : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span style={{ color, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 400, lineHeight: 1.25 }}>{title}</span>
        {description ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
      </span>
      {value ? <span className="shrink-0" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span> : null}
    </>
  )
}

export function ListRow(props: Readonly<ListRowProps>) {
  const { trailing, action, chevron = true, onClick, readOnly = false } = props
  const body: ReactNode = <RowBody {...props} />
  const bodyStyle = { minHeight: 52, padding: '8px 0 8px 20px', gap: 12 } as const

  return (
    <div className="flex items-center" style={{ minHeight: 52 }}>
      {readOnly || !onClick ? (
        <div className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{body}</div>
      ) : (
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent text-left hover:bg-[var(--bg-elev)] active:bg-[var(--bg-elev-pressed)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" style={bodyStyle}>{body}</button>
      )}
      {trailing ? <span className="flex shrink-0 items-center px-2">{trailing}</span> : null}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-[var(--bg-elev)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" style={{ color: action.danger ? 'var(--status-bad)' : 'var(--fg-2)' }}>
          <Icon name={action.icon} size={20} color="currentColor" />
        </button>
      ) : null}
      {!readOnly && chevron ? <span className="flex h-11 w-11 shrink-0 items-center justify-center"><ChevronRight size={24} color="var(--fg-4)" strokeWidth={1.8} /></span> : <span style={{ width: 12 }} />}
    </div>
  )
}
