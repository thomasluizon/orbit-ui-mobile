import { FAB_SIZE } from '@orbit/shared/theme'
import { useMemo, useState } from 'react'
import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

export function useAstraButtonBlocked(enabled: boolean) {
  return useUIStore(state => enabled && (state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen))
}

/** The conversation entry: the live Orbit at 48 with no background at rest, in a 60 press target. A pointer hover
 *  paints the neutral hover fill of that circle on the pressed face, and keyboard focus draws the web focus ring around the unscaled target. */
export function AstraButton() {
  const { t } = useTranslation()
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [hovered, setHovered] = useState(false)
  return <MotionPressable
    testID="astra-button"
    accessibilityRole="button"
    accessibilityLabel={t('shell.astraButton.open')}
    onPress={() => openConversation(true)}
    onHoverIn={() => setHovered(true)}
    onHoverOut={() => setHovered(false)}
    focusInset
    focusOffset={2}
    focusColor={tokens.primary}
    style={[styles.target, hovered ? { backgroundColor: tokens.bgHover } : null]}
  >
    <OrbitMascot size={48} lead />
  </MotionPressable>
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', borderRadius: FAB_SIZE / 2, height: FAB_SIZE, justifyContent: 'center', width: FAB_SIZE },
})
