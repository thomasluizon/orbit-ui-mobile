import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'

/** A full-surface error of a Progresso sub-screen: Orbit in Parado, never sad, above the message and the retry icon, centred in the free area. */
export function ProgressSurfaceError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation()
  const size = useStateMascotSize()
  return (
    <ShellCentredRegion>
      <View testID="progress-surface-error" style={styles.group}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><OrbitMascot size={size} state="parado" /></View>
        <ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} />
      </View>
    </ShellCentredRegion>
  )
}

const styles = StyleSheet.create({
  group: { alignItems: 'center' },
})
