'use client'


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
      className="orbit-content-frame flex flex-col"
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
