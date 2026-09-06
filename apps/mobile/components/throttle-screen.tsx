import { Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThrottleStore } from '@/stores/throttle-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { queryClient } from '@/lib/query-client'
import { createTokensV2 } from '@/lib/theme'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'

export function ThrottleScreen() {
  const { error, clear } = useThrottleStore()
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  if (!error || upgradeRequired) return null
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
