import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Download } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { startAndroidUpdate, useVersionCheck } from '@/hooks/use-version-check'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const SNOOZE_STORAGE_KEY = 'orbit:version-update-snoozed-until'
const SNOOZE_DURATION_MS = 1000 * 60 * 60 * 24

/**
 * Version-update sheet (iOS path) per the m-version artboard: sheet title,
 * Rubik version highlight, Roboto tabular delta, fg-2 body, then a primary
 * update pill with download glyph and a ghost Later pill.
 * Android path defers to native Play Core flow.
 */
export function VersionUpdateDrawer() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const {
    updateAvailable,
    forceUpdate,
    latestVersion,
    currentVersion,
    iosStoreUrl,
  } = useVersionCheck()

  const androidFlowStartedRef = useRef(false)
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null)
  const [snoozeLoaded, setSnoozeLoaded] = useState(false)
  const [dismissedForSession, setDismissedForSession] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(SNOOZE_STORAGE_KEY)
      .then((value) => {
        if (cancelled) return
        const parsed = value ? Number.parseInt(value, 10) : NaN
        setSnoozedUntil(Number.isFinite(parsed) ? parsed : null)
        setSnoozeLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setSnoozeLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    if (!updateAvailable) return
    if (androidFlowStartedRef.current) return
    if (!forceUpdate) {
      const isSnoozed = snoozedUntil !== null && snoozedUntil > Date.now()
      if (!snoozeLoaded || isSnoozed || dismissedForSession) return
    }
    androidFlowStartedRef.current = true
    void startAndroidUpdate({ immediate: forceUpdate })
    if (!forceUpdate) {
      const until = Date.now() + SNOOZE_DURATION_MS
       
      setSnoozedUntil(until)
      AsyncStorage.setItem(SNOOZE_STORAGE_KEY, String(until)).catch(() => {})
    }
  }, [updateAvailable, forceUpdate, snoozeLoaded, snoozedUntil, dismissedForSession])

  const shouldShowIosSheet = useMemo(() => {
    if (Platform.OS !== 'ios') return false
    if (!updateAvailable) return false
    if (!iosStoreUrl) return false
    if (!snoozeLoaded) return false
    const isSnoozed = snoozedUntil !== null && snoozedUntil > nowMs
    return !isSnoozed && !dismissedForSession
  }, [
    updateAvailable,
    iosStoreUrl,
    snoozeLoaded,
    snoozedUntil,
    dismissedForSession,
    nowMs,
  ])

  const handleIosUpdate = useCallback(() => {
    if (!iosStoreUrl) return
    void Linking.openURL(iosStoreUrl).catch(() => {})
    setDismissedForSession(true)
  }, [iosStoreUrl])

  const handleIosLater = useCallback(() => {
    const until = Date.now() + SNOOZE_DURATION_MS
    setSnoozedUntil(until)
    setDismissedForSession(true)
    AsyncStorage.setItem(SNOOZE_STORAGE_KEY, String(until)).catch(() => {})
  }, [])

  if (Platform.OS !== 'ios') return null

  return (
    <BottomSheetModal
      open={shouldShowIosSheet}
      onClose={handleIosLater}
      title={t('versionUpdate.title')}
      snapPoints={['55%']}
    >
      <View style={styles.container}>
        <Text style={styles.title}>
          {latestVersion ? `Orbit ${latestVersion}` : t('versionUpdate.title')}
        </Text>
        {currentVersion && latestVersion ? (
          <Text style={styles.delta}>
            {currentVersion} → {latestVersion}
          </Text>
        ) : null}
        <Text style={styles.description}>
          {t('versionUpdate.description')}
        </Text>

        <View style={styles.spacer} />

        <View style={styles.buttons}>
          <PillButton
            fullWidth
            onPress={handleIosUpdate}
            leading={<Download size={18} color={tokens.fgOnPrimary} strokeWidth={1.8} />}
          >
            {t('versionUpdate.updateCta')}
          </PillButton>
          <PillButton variant="ghost" fullWidth onPress={handleIosLater}>
            {t('versionUpdate.laterCta')}
          </PillButton>
        </View>
      </View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 22,
      paddingTop: 10,
      paddingBottom: 22,
      gap: 12,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 20,
      color: tokens.fg1,
    },
    delta: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg2,
      marginTop: 4,
    },
    spacer: {
      flex: 1,
      minHeight: 12,
    },
    buttons: {
      flexDirection: 'column',
      gap: 10,
      paddingTop: 10,
    },
  })
}
