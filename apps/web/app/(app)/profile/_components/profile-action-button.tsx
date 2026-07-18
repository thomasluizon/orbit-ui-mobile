'use client'

import type { LucideIcon } from '@/components/ui/icons'

interface ProfileActionButtonProps {
  label: string
  onClick: () => void
  /** Leading lucide icon rendered 22/1.8 in the kit ListRow 26px slot. */
  icon?: LucideIcon
  tone?: 'default' | 'danger'
}

/** Kit ListRow action — `tone="danger"` colors icon and label in status-bad.
 *  Draws no rule of its own; wrap in `SettingsGroup` to separate adjacent actions. */
export function ProfileActionButton({
  label,
  onClick,
  icon: LeadingIcon,
  tone = 'default',
}: Readonly<ProfileActionButtonProps>) {
  const color = tone === 'danger' ? 'var(--status-bad)' : 'var(--fg-1)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center bg-transparent text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:bg-[var(--bg-elev-pressed)]"
      style={{
        appearance: 'none',
        border: 0,
        padding: '16px 20px',
        gap: 14,
      }}
    >
      {LeadingIcon && (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 justify-center"
          style={{ width: 26 }}
        >
          <LeadingIcon size={22} strokeWidth={1.8} color={color} />
        </span>
      )}
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 1.25,
          color,
        }}
      >
        {label}
      </span>
    </button>
  )
}
