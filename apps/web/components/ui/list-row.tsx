'use client'

import { useState, type ReactNode } from 'react'
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
  const [interaction, setInteraction] = useState<'rest' | 'hover' | 'pressed'>('rest')
  const body: ReactNode = <RowBody {...props} />
  const content = <>{body}{!readOnly && chevron ? <span className="flex h-11 w-11 shrink-0 items-center justify-center"><ChevronRight size={24} color="var(--fg-4)" strokeWidth={1.8} /></span> : null}</>
  const bodyStyle = { minHeight: 52, padding: '8px 12px', gap: 12 } as const

  return (
    <div className="flex min-w-0 items-center" style={{ minHeight: 52 }}>
      {readOnly || !onClick ? (
        <div className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{content}</div>
      ) : (
        <button
          type="button"
          data-interaction={interaction}
          onBlur={() => setInteraction('rest')}
          onClick={onClick}
          onPointerCancel={() => setInteraction('rest')}
          onPointerDown={() => setInteraction('pressed')}
          onPointerEnter={() => setInteraction('hover')}
          onPointerLeave={() => setInteraction('rest')}
          onPointerUp={() => setInteraction('hover')}
          className="list-row-button flex min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent text-left"
          style={bodyStyle}
        >{content}</button>
      )}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors duration-[var(--dur-hover-control)] hover:text-[var(--fg-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]" style={{ color: action.danger ? 'var(--status-bad)' : 'var(--fg-2)' }}>
          <Icon name={action.icon} size={20} color="currentColor" />
        </button>
      ) : null}
    </div>
  )
}
