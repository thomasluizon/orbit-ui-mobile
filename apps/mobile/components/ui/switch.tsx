import type { SwitchProps } from '@orbit/shared/contracts/forms'
import { StyleSheet, View } from 'react-native'
import { ListRow } from './list-row'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function Switch({ label, checked, disabled = false, onChange }: Readonly<SwitchProps>) {
  return <ListRow title={label} disabled={disabled} toggle={{ checked, onChange }} />
}

export function SwitchTrack({ checked, pending }: Readonly<{ checked: boolean; pending?: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View accessible={false} importantForAccessibility="no-hide-descendants" data-slot="switch-track" data-checked={checked ? '' : undefined} data-pending={pending ? '' : undefined} style={[styles.track, { backgroundColor: checked ? tokens.primary : tokens.trackEmpty }]}>
    <View style={[styles.thumb, { backgroundColor: tokens.fgOnPrimary, transform: [{ translateX: checked ? 23 : 3 }] }]} />
  </View>
}

const styles = StyleSheet.create({
  track: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center' },
  thumb: { width: 22, height: 22, borderRadius: 11 },
})
