import { useMemo, useState, useSyncExternalStore } from 'react'
import { FAB_SIZE } from '@orbit/shared/theme'
import { getOrbitPageTurns, subscribeOrbitLoop } from '@orbit/shared/utils'
import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

export function useOrbitButtonBlocked(enabled: boolean) {
  return useUIStore(state => enabled && (state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.orbitConversationOpen))
}

/** The conversation entry: the live Orbit at 48 on a solid `bgElev` circle with a 1px `borderControl` edge, the size of its 60 press target.
 *  A pointer hover paints the opaque elevated hover fill of that circle, and keyboard focus draws the web focus ring around the unscaled target.
 *  Its ring turns once when the person changes the page. */
export function OrbitButton() {
  const { t } = useTranslation()
  const pageTurns = useSyncExternalStore(subscribeOrbitLoop, getOrbitPageTurns, getOrbitPageTurns)
  const openConversation = useUIStore(state => state.setOrbitConversationOpen)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [hovered, setHovered] = useState(false)
  return <MotionPressable
    testID="orbit-button"
    accessibilityRole="button"
    accessibilityLabel={t('shell.orbitButton.open')}
    onPress={() => openConversation(true)}
    onHoverIn={() => setHovered(true)}
    onHoverOut={() => setHovered(false)}
    focusInset
    focusOffset={2}
    focusColor={tokens.primary}
    style={[styles.target, { backgroundColor: hovered ? tokens.bgElevHover : tokens.bgElev, borderColor: tokens.borderControl }]}
  >
    <OrbitMascot size={48} live="lead" turnKey={pageTurns} />
  </MotionPressable>
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', borderRadius: FAB_SIZE / 2, borderWidth: 1, height: FAB_SIZE, justifyContent: 'center', width: FAB_SIZE },
})
