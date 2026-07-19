'use client'

import type { ReactNode } from 'react'
import { Plus } from '@/components/ui/icons'
import { AstraMark } from '@/components/ui/astra-avatar'
import { EmptyState, type EmptyStateAction } from '@/components/ui/empty-state'
import { PillButton } from '@/components/ui/pill-button'
import { SkeletonHabitRow } from '@/components/ui/skeleton'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  askAstraLabel?: string
  onAskAstra?: () => void
  variant?: 'primary' | 'secondary'
}

/** The habit-list empty surface (Today / all / general, both all-done and
 *  no-habits), rendered through the shared EmptyState lockup. The primary
 *  variant stacks an Ask-Astra pill over a ghost create pill; the secondary
 *  variant shows a single ghost action. The body renders only when it is a
 *  distinct sentence from the title — the empty-view keys reuse the title. */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  askAstraLabel,
  onAskAstra,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription = Boolean(description) && description !== title

  let action: EmptyStateAction | undefined
  let footer: ReactNode

  if (isAstraPrompt && askAstraLabel && onAskAstra) {
    action = {
      label: askAstraLabel,
      onClick: onAskAstra,
      leading: <AstraMark size={18} color="var(--fg-on-primary)" aria-hidden="true" />,
    }
    if (actionLabel) {
      footer = (
        <PillButton
          variant="ghost"
          onClick={onAction}
          leading={<Plus size={18} strokeWidth={1.8} aria-hidden="true" />}
        >
          {actionLabel}
        </PillButton>
      )
    }
  } else if (actionLabel) {
    action = {
      label: actionLabel,
      onClick: onAction,
      variant: 'secondary',
      leading: isAstraPrompt ? <Plus size={18} strokeWidth={1.8} aria-hidden="true" /> : undefined,
    }
  }

  return (
    <EmptyState
      title={title}
      description={hasDistinctDescription ? description : undefined}
      action={action}
      footer={footer}
      matchActionFooterWidth={Boolean(action) && Boolean(footer)}
    />
  )
}

/** First-load / drill-down placeholder: three habit-row skeletons on the list's
 *  own vertical rhythm, sharing the shared SkeletonHabitRow shape and pulse so
 *  the loading cadence matches the Today sections. */
export function HabitListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-1">
      {[1, 2, 3].map((row) => (
        <SkeletonHabitRow key={row} />
      ))}
    </div>
  )
}
