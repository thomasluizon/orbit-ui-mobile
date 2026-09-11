import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  PROFILE_SETTINGS_GROUPS,
  type ProfileSettingsGroupId,
} from '@orbit/shared/utils/profile-navigation'
import { RowList } from '@/components/ui/row-list'
import { Skeleton } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type GroupLabels = Record<ProfileSettingsGroupId, string>
type GroupRows = Partial<Record<ProfileSettingsGroupId, ReactNode>>

interface ProfileSettingsFrameProps {
  isLoading: boolean
  loadingLabel: string
  labels: GroupLabels
  rows: GroupRows
  uncontainedGroups?: readonly ProfileSettingsGroupId[]
}

interface ProfileValueRowProps {
  label: string
  value?: ReactNode
  control: ReactNode
}

export function ProfileValueRow({ label, value, control }: Readonly<ProfileValueRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View testID="profile-value-row" style={styles.valueRow}>
      <Text style={[styles.valueLabel, { color: tokens.fg1 }]}>{label}</Text>
      {value != null ? <View style={styles.value}>{value}</View> : null}
      <View style={styles.control}>{control}</View>
    </View>
  )
}

export function ProfileSettingsFrame({
  isLoading,
  loadingLabel,
  labels,
  rows,
  uncontainedGroups = [],
}: Readonly<ProfileSettingsFrameProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  if (isLoading) {
    return <Skeleton variant="settings" rows={8} label={loadingLabel} />
  }

  return (
    <View testID="profile-settings-groups" style={styles.groups}>
      {PROFILE_SETTINGS_GROUPS.map((group) => (
        <View
          key={group.id}
          testID={`profile-settings-group-${group.id}`}
          style={styles.group}
        >
          <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg1 }]}>
            {labels[group.id]}
          </Text>
          {rows[group.id] == null
            ? null
            : uncontainedGroups.includes(group.id)
              ? rows[group.id]
              : <RowList>{rows[group.id]}</RowList>}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  groups: {
    width: '100%',
    gap: 32,
  },
  group: {
    gap: 12,
  },
  heading: {
    fontFamily: 'Geist_500Medium',
    fontSize: 20,
    letterSpacing: -0.2,
  },
  valueRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  valueLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Geist_400Regular',
    fontSize: 17,
    lineHeight: 22.95,
  },
  value: {
    flexShrink: 0,
  },
  control: {
    flexShrink: 0,
    alignItems: 'center',
  },
})
