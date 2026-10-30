import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThrottleStore } from '@/stores/throttle-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { queryClient } from '@/lib/query-client'
import { createTokensV2 } from '@/lib/theme'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { NativeDialog } from '@/components/ui/native-dialog'
import { getErrorSurface } from '@orbit/shared/utils'

export function ThrottleScreen() {
  const { t } = useTranslation()
  const { error, clear } = useThrottleStore()
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  const visible = Boolean(error && !upgradeRequired)
  if (!visible) return null
  return (
    <NativeDialog open title={t(getErrorSurface(error).retryAt === null ? 'errorScreen.title' : 'errorScreen.throttleTitle')} onOpenChange={() => {}}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: createTokensV2().bg }}>
        <AppErrorScreen error={error} retry={async () => {
          clear()
          await queryClient.refetchQueries({ type: 'active' })
        }} />
      </SafeAreaView>
    </NativeDialog>
  )
}
