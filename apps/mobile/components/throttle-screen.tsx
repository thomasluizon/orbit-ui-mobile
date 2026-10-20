import { useEffect, useId } from 'react'
import { Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThrottleStore } from '@/stores/throttle-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { queryClient } from '@/lib/query-client'
import { createTokensV2 } from '@/lib/theme'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { useUIStore } from '@/stores/ui-store'

export function ThrottleScreen() {
  const { error, clear } = useThrottleStore()
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  const overlayId = useId()
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const visible = Boolean(error && !upgradeRequired)
  useEffect(() => {
    if (!visible) return
    registerOpenOverlay(overlayId)
    return () => unregisterOpenOverlay(overlayId)
  }, [overlayId, registerOpenOverlay, unregisterOpenOverlay, visible])
  if (!visible) return null
  return (
    <Modal visible animationType="none" onRequestClose={() => {}}>
      <SafeAreaView style={{ flex: 1, backgroundColor: createTokensV2().bg }}>
        <AppErrorScreen error={error} retry={async () => {
          clear()
          await queryClient.refetchQueries({ type: 'active' })
        }} />
      </SafeAreaView>
    </Modal>
  )
}
