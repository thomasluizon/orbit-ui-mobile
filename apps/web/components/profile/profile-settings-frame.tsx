'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import type { ReactNode } from 'react'
import {
  PROFILE_SETTINGS_GROUPS,
  type ProfileSettingsGroupId,
} from '@orbit/shared/utils/profile-navigation'
import { RowList } from '@/components/ui/row-list'
import { Skeleton } from '@/components/ui/skeleton'

type GroupLabels = Partial<Record<ProfileSettingsGroupId, string>>
type GroupRows = Partial<Record<ProfileSettingsGroupId, ReactNode>>

interface ProfileSettingsFrameProps {
  isLoading: boolean
  loadingLabel: string
  labels: GroupLabels
  rows: GroupRows
}

interface ProfileValueRowProps {
  label: string
  value?: ReactNode
  control: ReactNode
}

export function ProfileValueRow({ label, value, control }: Readonly<ProfileValueRowProps>) {
  return (
    <div
      data-testid="profile-value-row"
      className="flex flex-wrap items-center"
      style={{ minHeight: TOUCH_TARGET_MIN, padding: '12px 16px', gap: 12 }}
    >
      <span className="min-w-0 font-sans text-[17px] text-[var(--fg-1)]" style={{ flex: '1 1 120px' }}>
        {label}
      </span>
      {value ? (
        <span className="shrink-0 font-mono text-[12px] text-[var(--fg-3)]">
          {value}
        </span>
      ) : null}
      <span className="flex max-w-full shrink items-center">{control}</span>
    </div>
  )
}

export function ProfileSettingsFrame({
  isLoading,
  loadingLabel,
  labels,
  rows,
}: Readonly<ProfileSettingsFrameProps>) {
  if (isLoading) {
    return <Skeleton variant="settings" rows={8} label={loadingLabel} />
  }

  return (
    <div
      data-testid="profile-settings-groups"
      className="flex w-full max-w-[560px] flex-col px-4"
      style={{ gap: 32 }}
    >
      {PROFILE_SETTINGS_GROUPS.map((group) => (
        <section
          key={group.id}
          data-testid={`profile-settings-group-${group.id}`}
          className="flex flex-col"
          style={{ gap: 12 }}
        >
          {labels[group.id] ? <h2 className="font-sans text-[20px] font-medium tracking-[-0.01em] text-[var(--fg-1)]">
            {labels[group.id]}
          </h2> : null}
          {rows[group.id] == null ? null : <RowList>{rows[group.id]}</RowList>}
        </section>
      ))}
    </div>
  )
}
