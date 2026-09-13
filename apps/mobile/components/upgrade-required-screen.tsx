import { useState } from 'react'
import { Linking, Modal, ScrollView, Text, View } from 'react-native'
import appConfig from '@/app.json'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PillButton } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { errorSurfaceStyles as styles } from '@/components/ui/error-surface-styles'
import { getAppVersion } from '@/lib/app-version'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useVersionGateStore } from '@/stores/version-gate-store'

export function UpgradeRequiredScreen() {
  const { t } = useTranslation()
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  const minVersion = useVersionGateStore((s) => s.minVersion)
  const { currentScheme, currentTheme } = useAppTheme()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!upgradeRequired) return null
  const tokens = createTokensV2(currentScheme, currentTheme)
  const currentVersion = getAppVersion()
  const openStore = async () => {
    setBusy(true)
    setFailed(false)
    const packageName = appConfig.expo.android.package
    const webUrl = `https://play.google.com/store/apps/details?id=${packageName}`
    try {
      try { await Linking.openURL(`market://details?id=${packageName}`) }
      catch { await Linking.openURL(webUrl) }
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <Modal visible animationType="none" onRequestClose={() => {}}>
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 24, padding: 32 }}>
          <OrbitMark size={40} />
          <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t('forceUpdate.title')}</Text>
          <Text style={[styles.body, { color: tokens.fg2 }]}>
            {currentVersion && minVersion ? t('forceUpdate.versions', { currentVersion, minVersion }) : t('forceUpdate.description')}
          </Text>
          {failed ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.fg2 }]}>{t('forceUpdate.storeFailure')}</Text> : null}
          {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
          <View><PillButton loading={busy} onClick={() => { void openStore() }}>{t('forceUpdate.cta')}</PillButton></View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}
