import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import {
  startAndroidUpdate,
  useAndroidFlexibleUpdate,
  useVersionCheck,
} from '@/hooks/use-version-check'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const SNOOZE_STORAGE_KEY = 'orbit:version-update-snoozed-until'
const SNOOZE_DURATION_MS = 1000 * 60 * 60 * 24

interface VersionUpdateSheetProps {
  open: boolean
  title: string
  description: string
  actionLabel: string
  styles: ReturnType<typeof createStyles>
  onAction: () => void
  onLater: () => void
}

function VersionUpdateSheet({
  open,
  title,
  description,
  actionLabel,
  styles,
  onAction,
  onLater,
}: Readonly<VersionUpdateSheetProps>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  if (!open) return null

  return (
    <Sheet ref={sheetRef} open onClose={onLater} title={title} actions={
      <View style={styles.buttons}>
        <PillButton size="sm" variant="ghost" onClick={() => closeSheet()}>{t('versionUpdate.laterCta')}</PillButton>
        <PillButton size="sm" onClick={() => closeSheet(onAction)}>{actionLabel}</PillButton>
      </View>
    }>
      <Text style={styles.description}>{description}</Text>
    </Sheet>
  )
}

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
    iosStoreUrl,
  } = useVersionCheck()

  const androidImmediateStartedRef = useRef(false)
  const [androidRequested, setAndroidRequested] = useState(false)
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null)
  const [snoozeLoaded, setSnoozeLoaded] = useState(false)
  const [dismissedForSession, setDismissedForSession] = useState(false)
  const [androidRestartDismissed, setAndroidRestartDismissed] = useState(false)
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
        const parsed = value ? Number.parseInt(value, 10) : Number.NaN
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

  const isSnoozed = snoozedUntil !== null && snoozedUntil > nowMs

  const androidFlexibleActive =
    Platform.OS === 'android' &&
    androidRequested &&
    updateAvailable &&
    !forceUpdate

  const { downloaded: androidUpdateReady, install: installAndroidUpdate } =
    useAndroidFlexibleUpdate(androidFlexibleActive)

  useEffect(() => {
    if (Platform.OS !== 'android' || !updateAvailable || !forceUpdate) return
    if (androidImmediateStartedRef.current) return
    androidImmediateStartedRef.current = true
    void startAndroidUpdate({ immediate: true })
  }, [updateAvailable, forceUpdate])

  const shouldShowIosSheet =
    Platform.OS === 'ios' &&
    updateAvailable &&
    !!iosStoreUrl &&
    snoozeLoaded &&
    !isSnoozed &&
    !dismissedForSession

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

  const handleAndroidLater = () => setAndroidRestartDismissed(true)

  if (Platform.OS === 'android') {
    return <AndroidVersionUpdateSheet ready={androidUpdateReady} restartDismissed={androidRestartDismissed}
      softOpen={updateAvailable && !forceUpdate && snoozeLoaded && !isSnoozed && !dismissedForSession && !androidRequested}
      styles={styles} install={installAndroidUpdate} request={() => setAndroidRequested(true)}
      later={handleIosLater} restartLater={handleAndroidLater} />
  }

  if (Platform.OS !== 'ios') return null

  return (
    <VersionUpdateSheet
      open={shouldShowIosSheet}
      title={t('versionUpdate.title')}
      description={t('versionUpdate.description')}
      actionLabel={t('versionUpdate.updateCta')}
      styles={styles}
      onAction={handleIosUpdate}
      onLater={handleIosLater}
    />
  )
}

function AndroidVersionUpdateSheet({ ready, softOpen, restartDismissed, styles, install, request, later, restartLater }: Readonly<{
  ready: boolean; softOpen: boolean; restartDismissed: boolean
  styles: ReturnType<typeof createStyles>
  install: () => void; request: () => void; later: () => void; restartLater: () => void
}>) {
  const { t } = useTranslation()
  return <VersionUpdateSheet open={ready ? !restartDismissed : softOpen}
    title={t(ready ? 'versionUpdate.readyTitle' : 'versionUpdate.title')}
    description={t(ready ? 'versionUpdate.readyDescription' : 'versionUpdate.description')}
    actionLabel={t(ready ? 'versionUpdate.restartCta' : 'versionUpdate.updateCta')}
    styles={styles} onAction={ready ? install : request} onLater={ready ? restartLater : later} />
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    description: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24.8,
      color: tokens.fg2,
    },
    buttons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingTop: 8,
    },
  })
}
