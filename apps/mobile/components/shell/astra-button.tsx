import { FAB_SIZE } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useUIStore } from '@/stores/ui-store'

export function useAstraButtonBlocked(enabled: boolean) {
  return useUIStore(state => enabled && (state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen))
}

/** The conversation entry: the live Orbit at 48 with no background, in a 60 press target. */
export function AstraButton() {
  const { t } = useTranslation()
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  return <MotionPressable
    testID="astra-button"
    accessibilityRole="button"
    accessibilityLabel={t('shell.astraButton.open')}
    onPress={() => openConversation(true)}
    style={styles.target}
  >
    <OrbitMascot size={48} />
  </MotionPressable>
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', height: FAB_SIZE, justifyContent: 'center', width: FAB_SIZE },
})
