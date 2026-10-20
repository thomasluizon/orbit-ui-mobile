import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { buildAccountScopedStorageKey, readAccountScopedFlag, TRIAL_EXPIRED_SEEN_KEY } from '@orbit/shared/utils'
import { hasOpenPromptBlockingOverlay } from '@orbit/shared/stores'
import { useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from '@/components/ui/pill-button'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { ActionRow } from '@/components/ui/action-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

const STORAGE_KEY = TRIAL_EXPIRED_SEEN_KEY

const PAUSED_FEATURES = [
  'trial.expired.astraCeiling',
  'trial.expired.calendarSync',
  'trial.expired.retrospective',
  'trial.expired.proactiveAstra',
] as const

export function TrialExpiredModal() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(createStyles, [])
  const { sheetRef, closeSheet } = useSheetHost()
  const trialExpired = useTrialExpired()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)
  const accountGeneration = useAccountGeneration()
  const [noticeState, setNoticeState] = useState({
    accountId,
    dismissed: false,
    alreadySeen: true,
  })
  const currentNoticeState = noticeState.accountId === accountId
    ? noticeState
    : { accountId, dismissed: false, alreadySeen: true }
  if (noticeState.accountId !== accountId) setNoticeState(currentNoticeState)
  const scopedKey = accountId === null ? null : buildAccountScopedStorageKey(STORAGE_KEY, accountId)
  const promptId = useId()
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const openOverlayIds = useUIStore((state) => state.openOverlayIds)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const reservationId = `${promptId}:${scopedKey ?? ''}`

  /**
   * Moves a notice dismissed before this key carried an account on to the account signed in now,
   * then consumes the old key. Left in place it would answer for every later account too, which
   * is the defect rather than a milder version of it.
   */
  useEffect(() => {
    if (scopedKey === null) return
    let cancelled = false
    void AsyncStorage.multiGet([scopedKey, STORAGE_KEY]).then(([scoped, legacy]) => {
      if (cancelled) return
      const flag = readAccountScopedFlag(scoped?.[1] ?? null, legacy?.[1] ?? null)
      if (flag.adoptsLegacy) {
        void AsyncStorage.setItem(scopedKey, '1')
        void AsyncStorage.removeItem(STORAGE_KEY)
      }
      setNoticeState((current) => current.accountId === accountId
        ? { ...current, alreadySeen: flag.seen }
        : current)
    })
    return () => {
      cancelled = true
    }
  }, [accountId, scopedKey])

  const isOpen =
    pathname !== '/upgrade' && !currentNoticeState.dismissed && trialExpired &&
    !currentNoticeState.alreadySeen
  const reserved = openOverlayIds.includes(reservationId)
  const presented = isOpen && reserved
  useEffect(() => {
    if (!isOpen) {
      if (reserved) unregisterOpenOverlay(reservationId)
      return
    }
    if (!reserved && !anotherOverlayOpen) useUIStore.getState().tryReservePromptOverlay(reservationId)
  }, [anotherOverlayOpen, isOpen, reservationId, reserved, unregisterOpenOverlay])
  useEffect(() => {
    return () => unregisterOpenOverlay(reservationId)
  }, [reservationId, unregisterOpenOverlay])

  const hide = useCallback(() => {
    if (getAccountGeneration() !== accountGeneration) return
    setNoticeState((current) => current.accountId === accountId
      ? { ...current, dismissed: true }
      : current)
    if (scopedKey !== null) void AsyncStorage.setItem(scopedKey, '1')
  }, [accountGeneration, accountId, scopedKey])

  if (!presented) return null

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={hide}
      title={t('trial.expired.heading')}
      actions={
        <ActionRow>
          <PromptQuietAction onClick={() => closeSheet()}>
            {t('trial.expired.continueFree')}
          </PromptQuietAction>
          <PillButton
            size="sm"
            onClick={() =>
              closeSheet(() => {
                if (getAccountGeneration() !== accountGeneration) return
                hide()
                router.push(buildUpgradeHref(pathname || '/'))
              })
            }
          >
            {t('trial.expired.subscribe')}
          </PillButton>
        </ActionRow>
      }
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('trial.expired.eyebrow')}
          </Text>
          <Text style={[styles.subtitle, { color: tokens.fg2 }]}>
            {t('trial.expired.subtitleQuiet')}
          </Text>
        </View>

        <SettingsGroup>
          {PAUSED_FEATURES.map((featureKey) => (
            <ListRow readOnly textMode="label"
              key={featureKey}
              title={t(featureKey)}
              description={t('trial.expired.paused')}
            />
          ))}
        </SettingsGroup>
      </View>
    </Sheet>
  )
}

function createStyles() {
  return StyleSheet.create({
    content: {
      gap: 24,
    },
    intro: {
      gap: 8,
    },
    eyebrow: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      lineHeight: 16,
      textTransform: 'uppercase',
    },
    subtitle: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
    },
  })
}
