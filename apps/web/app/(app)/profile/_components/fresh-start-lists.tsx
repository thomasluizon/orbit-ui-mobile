'use client'

import { SPACING } from '@orbit/shared/theme'
import { useTranslations } from 'next-intl'
import { Check, X } from '@/components/ui/icons'

function ListBlock({
  title,
  items,
  itemIcon,
}: Readonly<{ title: string; items: string[]; itemIcon: 'delete' | 'keep' }>) {
  return (
    <div
      className="flex flex-col rounded-[16px]"
      style={{
        gap: 8,
        padding: "var(--orbit-space-12) var(--orbit-space-16)",
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
        }}
      >
        {title}
      </div>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {items.map((item) => (
          <span key={item} className="flex items-start" style={{ gap: 8 }}>
            {itemIcon === 'delete' ? (
              <X
                size={16}
                strokeWidth={1.8}
                color="var(--status-bad)"
                aria-hidden="true"
                className="shrink-0"
                style={{ marginTop: SPACING.s0 }}
              />
            ) : (
              <Check
                size={16}
                strokeWidth={1.8}
                color="var(--status-done)"
                aria-hidden="true"
                className="shrink-0"
                style={{ marginTop: SPACING.s0 }}
              />
            )}
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.4,
                color: 'var(--fg-2)',
              }}
            >
              {item}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** What a fresh start deletes and what it keeps: the two lists the sheet and the flow both show. */
export function FreshStartLists({ deletedItems, preservedItems }: Readonly<{ deletedItems: string[]; preservedItems: string[] }>) {
  const t = useTranslations()
  return (
    <div data-fresh-start-lists="" className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <ListBlock title={t('profile.freshStart.willDelete')} items={deletedItems} itemIcon="delete" />
      <ListBlock title={t('profile.freshStart.willKeep')} items={preservedItems} itemIcon="keep" />
    </div>
  )
}
