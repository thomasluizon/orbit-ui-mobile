import { StyleSheet, View } from 'react-native'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { useFlag } from '@/hooks/use-flag'
import { isNetworkUnavailableError } from '@orbit/shared/utils'

/** The full-surface load error of habit detail. With the guided flows on, Orbit in Parado, never sad, sits above the message and the retry, centred in the free area, and a read that failed for want of a connection says so. */
export function HabitDetailLoadError({ message, offlineMessage, error: failure, retryLabel, onRetry }: Readonly<{ message: string; offlineMessage?: string; error?: unknown; retryLabel: string; onRetry: () => void }>) {
  const guided = useFlag('orbit_guided_flows')
  const size = useStateMascotSize()
  const shown = guided && offlineMessage && isNetworkUnavailableError(failure) ? offlineMessage : message
  const error = <ErrorState message={shown} action={<IconButton label={retryLabel} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} />
  if (!guided) return <View style={styles.content}>{error}</View>
  return (
    <ShellCentredRegion>
      <View testID="habit-detail-load-error" style={styles.group}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><OrbitMascot size={size} state="parado" /></View>
        {error}
      </View>
    </ShellCentredRegion>
  )
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', width: '100%', maxWidth: 620, gap: 24 },
  group: { alignItems: 'center' },
})
