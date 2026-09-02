'use client'

import type { SettingsGroupProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'

export function SettingsGroup({ items }: Readonly<SettingsGroupProps>) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 20, boxShadow: 'inset 0 0 0 1px var(--hairline)', overflow: 'hidden' }}>
      {items.map((item, index) => {
        const content = (
          <>
            <span className="min-w-0 flex-1" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 16 }}>{item.label}</span>
            {item.value ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{item.value}</span> : null}
            {item.trailing}
            {item.onClick ? <ChevronRight size={24} color="var(--fg-4)" strokeWidth={1.8} /> : null}
          </>
        )
        return item.onClick ? (
          <button key={`${item.label}-${index}`} type="button" onClick={item.onClick} className="flex w-full cursor-pointer items-center border-0 bg-transparent px-4 text-left hover:bg-[var(--bg-elev)] active:bg-[var(--bg-hover)]" style={{ gap: 12, minHeight: 52, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}>{content}</button>
        ) : (
          <div key={`${item.label}-${index}`} className="flex items-center px-4" style={{ gap: 12, minHeight: 52, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}>{content}</div>
        )
      })}
    </div>
  )
}
