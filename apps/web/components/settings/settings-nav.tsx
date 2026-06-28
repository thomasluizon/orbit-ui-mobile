'use client'

import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'

export interface SettingsNavItem {
  id: string
  label: string
  icon: ComponentType<LucideProps>
  onSelect: () => void
}

interface SettingsNavProps {
  items: readonly SettingsNavItem[]
  activeId: string
  title: string
  subtitle: string
  ariaLabel: string
}

/**
 * Desktop settings sub-navigation (≥768px). Presentational: the shell wires the
 * route + active panel into `items`/`activeId`. The active item is a full
 * primary-tinted pill, never a side-stripe. Hidden below 768px so the per-page
 * phone layout renders untouched.
 */
export function SettingsNav({
  items,
  activeId,
  title,
  subtitle,
  ariaLabel,
}: Readonly<SettingsNavProps>) {
  return (
    <aside
      data-settings-nav=""
      aria-label={ariaLabel}
      className="thin-scrollbar hidden shrink-0 flex-col md:flex md:sticky md:top-0 md:max-h-dvh md:self-start md:overflow-y-auto"
      style={{ paddingTop: 'calc(var(--safe-top) + 14px)', paddingBottom: 14, gap: 8 }}
    >
      <div className="flex flex-col" style={{ paddingInline: 12, gap: 2 }}>
        <span className="t-display select-none" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>
          {title}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {subtitle}
        </span>
      </div>

      <nav aria-label={ariaLabel} className="flex flex-col" style={{ gap: 2 }}>
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              aria-current={isActive ? 'page' : undefined}
              className={
                'flex items-center rounded-[12px] transition-[background-color,color] duration-[160ms] ease-[var(--ease-standard)] ' +
                (isActive
                  ? 'text-[var(--primary-soft)]'
                  : 'text-[var(--fg-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
              }
              style={{
                minHeight: 44,
                gap: 12,
                paddingInline: 12,
                background: isActive ? 'var(--selection-bg)' : undefined,
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.2 : 1.8}
                color={isActive ? 'var(--primary)' : 'currentColor'}
              />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
