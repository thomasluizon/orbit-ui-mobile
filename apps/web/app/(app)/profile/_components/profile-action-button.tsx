'use client'

import type { LucideIcon } from 'lucide-react'

interface ProfileActionButtonProps {
  label: string
  onClick: () => void
  /** Leading lucide icon rendered 22/1.8 in the kit ListRow 26px slot. */
  icon?: LucideIcon
  tone?: 'default' | 'primary' | 'danger'
  compact?: boolean
}

/** Kit ListRow action — `tone` colors icon and label (`primary` → accent, `danger` → status-bad); `compact` renders a quieter smaller row. */
export function ProfileActionButton({
  label,
  onClick,
  icon: LeadingIcon,
  tone = 'default',
  compact = false,
}: Readonly<ProfileActionButtonProps>) {
  const color =
    tone === 'danger'
      ? 'var(--status-bad)'
      : tone === 'primary'
        ? 'var(--primary)'
        : 'var(--fg-1)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center bg-transparent text-left transition-colors duration-150 ease-out hover:bg-[var(--bg-elev)]"
      style={{
        appearance: 'none',
        border: 0,
        padding: '16px 20px',
        gap: 14,
        borderBottom: '1px solid var(--hairline)',
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
          fontSize: compact ? 15 : 18,
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
