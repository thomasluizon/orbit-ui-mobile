'use client'

import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

export interface HabitListDateGroup {
  key: string
  label: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  variant?: 'primary' | 'secondary'
}

/** v8 empty state — italic title, optional Astra pill or quiet link.
 *  Description renders only when it's a distinct sentence from the title
 *  (avoids the legacy "title and description share the same key" double-render). */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription =
    Boolean(description) && description !== title

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ padding: '60px 24px', gap: 16 }}
    >
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 17,
          color: 'var(--fg-2)',
          fontStyle: 'italic',
        }}
      >
        {title}
      </div>
      {hasDistinctDescription && (
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      )}
      {actionLabel && (
        isAstraPrompt ? (
          <button
            type="button"
            onClick={onAction}
            className="appearance-none border-0 cursor-pointer inline-flex items-center"
            style={{
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              padding: '8px 14px',
              borderRadius: 999,
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              fontWeight: 500,
              gap: 8,
            }}
          >
            {actionLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg-1)',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              textDecorationThickness: 1,
              textDecorationColor: 'var(--hairline-strong)',
            }}
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}

interface HabitListDateGroupSectionProps {
  group: HabitListDateGroup
  overdueLabel: string
  children: ReactNode
}

/** v8 date-group header: 13px/600 muted label (overdue uses --status-overdue). */
export function HabitListDateGroupSection({
  group,
  overdueLabel,
  children,
}: Readonly<HabitListDateGroupSectionProps>) {
  return (
    <div key={group.key}>
      <div
        className="flex items-center"
        style={{
          padding: '16px 20px 8px',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: group.isOverdue ? 'var(--status-overdue)' : 'var(--fg-3)',
            whiteSpace: 'nowrap',
          }}
        >
          {group.isOverdue ? overdueLabel : group.label}
        </span>
        <div
          className="flex-1"
          style={{
            height: 1,
            background: group.isOverdue
              ? 'var(--status-overdue)'
              : 'var(--hairline)',
            opacity: group.isOverdue ? 0.32 : 1,
          }}
        />
      </div>
      <div>{children}</div>
    </div>
  )
}
