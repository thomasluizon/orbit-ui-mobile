import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Linking, Pressable, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Profile } from '@orbit/shared/types/profile'
import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { usePushSubscriptions } from '@/hooks/use-push-subscriptions'
import { WidgetInfoSheet } from '@/components/profile/advanced-sections'
import { buildProfilePickerLabels, buildClockFormatOptions, resolveHourCycle, deriveProfileAstraFeatures, deriveProfilePreferenceValues } from '@orbit/shared/utils'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import {
  BarChart3,
  Download,
  Lock,
  LogOut,
  RotateCcw,
  UserX,
  type Icon,
} from '@/components/ui/icons'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'
import {
  AstraSettingsSwitch,
  type AstraSettingsController,
  useAstraSettingsController,
} from '@/components/profile/astra-settings-controller'
import {
  ProfileSettingsFrame,
  ProfileValueRow,
} from '@/components/profile/profile-settings-frame'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { ProBadge } from '@/components/ui/pro-badge'
import { Toast } from '@/components/ui/app-toast'
import { useLogout } from '@/hooks/use-logout'
import { createTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { usePreferenceControls } from '@/app/use-preference-controls'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import { PreferencePickerSheet } from '@/components/profile/preferences-sections'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import { useSheetHost } from '@/components/ui/sheet'
import { DeleteAccountModal } from './delete-account-modal'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { useDataExport } from './use-data-export'
import { isStepUpVerified } from '@/lib/step-up-storage'
import { getAnalyticsOptOut, setAnalyticsOptOut } from '@/lib/posthog'

interface ProfileSettingsContentProps {
  profile: Profile | undefined
  isLoading: boolean
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslation>['t']
type Router = ReturnType<typeof useRouter>
type Tokens = ReturnType<typeof createTokensV2>

interface RowContext {
  profile: Profile | undefined
  router: Router
  t: Translate
  tokens: Tokens
}

const icon = (IconComponent: Icon) => (
  <IconComponent size={24} strokeWidth={1.8} />
)

function buildYouRows(
  { profile, t, tokens }: RowContext,
  exportError: string,
  isExporting: boolean,
  onEditName: () => void,
  onExport: () => void,
  onOpenTimeZone: () => void,
  controls: ReturnType<typeof usePreferenceControls>,
) {
  const { timeZone, languageLabel, weekStartLabel } = deriveProfilePreferenceValues({
    profile,
    selectedLanguage: controls.selectedLanguage,
    translate: t,
  })
  const timeZoneLabel = timeZone
    ? t('profile.settingsRows.timezoneValue', { timeZone })
    : t('profile.settingsRows.timezone')
  const themeChoice = (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('profile.settingsRows.theme')} style={{ flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%', gap: 4 }}>
      {(['dark', 'light'] as const).map((mode) => {
        const selected = controls.currentTheme === mode
        return (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(mode === 'dark' ? 'preferences.themeModeDark' : 'preferences.themeModeLight')}
            onPress={() => controls.handleThemeModeChange(mode)}
            style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? tokens.primaryDim : tokens.bgWell, borderWidth: selected ? 1.5 : 1, borderColor: selected ? tokens.primary : tokens.hairline }}
          >
            <Text style={{ color: selected ? tokens.fg1 : tokens.fg2 }}>{t(mode === 'dark' ? 'preferences.themeModeDark' : 'preferences.themeModeLight')}</Text>
          </Pressable>
        )
      })}
    </View>
  )

  return [
    <ListRow key="account" chevron title={profile?.name ?? t('profile.editName.title')} accessibilityLabel={t('profile.settingsRows.editName', { name: profile?.name ?? t('profile.editName.title'), email: profile?.email ?? '' })} description={profile?.email} onClick={onEditName} />,
    <ListRow key="timezone" compact chevron={false} title={t('profile.settingsRows.timezone')} accessibilityLabel={timeZoneLabel} value={profile?.timeZone ?? undefined} onClick={onOpenTimeZone} />,
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 99 controls this label under D42. */
    <ListRow key="week-start" compact chevron={false} title={t('profile.settingsRows.weekStart')} value={weekStartLabel} onClick={() => controls.setActivePicker('weekStart')} />,
    <ListRow key="clock" compact chevron={false} title={t('settings.clock.title')} value={profile ? buildClockFormatOptions(t).find((option) => option.value === (resolveHourCycle(profile.uses24HourClock, controls.selectedLanguage) === 'h23' ? '24h' : '12h'))?.label : undefined} onClick={() => controls.setActivePicker('clock')} />,
    <ListRow key="language" compact chevron={false} title={t('profile.language.title')} value={controls.selectedLanguage === 'pt-BR' ? t('profile.language.brazilianPortuguese') : languageLabel} onClick={() => controls.setActivePicker('language')} />,
    <ProfileValueRow key="theme" label={t('profile.settingsRows.theme')} control={themeChoice} />,
    <View key="show-general" style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, minWidth: 0, color: tokens.fg1, fontSize: 17 }}>{t('settings.homeScreen.showGeneral')}</Text>
        <Switch checked={controls.showGeneralOnToday} onChange={(next) => void controls.handleShowGeneralToggle(next)} label={t('settings.homeScreen.showGeneral')} />
      </View>
      <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('settings.homeScreen.showGeneralDesc')}</Text>
    </View>,
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 106 controls this label under D42. */
    <ListRow key="export" compact={!exportError} icon={icon(Download)} title={t('profile.settingsRows.export')} value={isExporting ? t('dataExport.preparing') : undefined} description={exportError || undefined} chevron={false} onClick={onExport} />,
  ]
}

function buildAstraRows(
  { profile, router, t }: RowContext,
  settings: AstraSettingsController,
  apiKeysUnlocked: boolean,
) {
  const onUpgrade = () => router.push(buildUpgradeHref('/profile'))
  const astraFeatures = deriveProfileAstraFeatures(Boolean(profile?.hasProAccess), settings)
  return (
    <View style={{ gap: 32 }}>
      <View style={{ gap: 12 }}>
      {profile ? (
        <AstraAllowancePanel
          profile={profile}
          onPlanAction={() => router.push(buildUpgradeHref('/profile'))}
        />
      ) : null}
      {profile ? (
        <RowList>
          {astraFeatures.map((feature) => !feature.locked ? (
            <ProfileValueRow
              key={feature.key}
              label={t(feature.labelKey)}
              control={<AstraSettingsSwitch checked={feature.checked} pending={feature.pending} label={t(feature.labelKey)} onToggle={feature.onToggle} />}
            />
          ) : (
            <ListRow key={feature.key} compact icon={icon(Lock)} title={t(feature.labelKey)} trailing={<ProBadge alwaysVisible />} chevron={false} onClick={onUpgrade} />
          ))}
        </RowList>
      ) : null}
      </View>
      <ProfileApiKeys profile={profile} unlocked={apiKeysUnlocked} />
    </View>
  )
}

interface TimeZonePickerProps {
  controls: ReturnType<typeof usePreferenceControls>
  profile: Profile | undefined
  t: Translate
  tokens: Tokens
}

function TimeZonePicker({ controls, profile, t, tokens }: Readonly<TimeZonePickerProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const pickerLabels = buildProfilePickerLabels(t)

  return (
    <PreferencePickerSheet
      tokens={tokens}
      activePicker={controls.activePicker}
      {...pickerLabels}
      selectedLanguage={controls.selectedLanguage}
      currentTheme={controls.currentTheme}
      timeZone={profile?.timeZone}
      weekStartDay={profile?.weekStartDay}
      uses24HourClock={profile?.uses24HourClock}
      sheetRef={sheetRef}
      closePicker={closeSheet}
      onHidden={() => controls.setActivePicker(null)}
      onLanguageChange={(locale) => void controls.handleLanguageChange(locale)}
      onThemeModeChange={controls.handleThemeModeChange}
      onTimeZoneChange={(timeZone) => controls.timeZoneMutation.mutate(timeZone)}
      onWeekStartChange={(day) => controls.weekStartMutation.mutate(day)}
      onClockFormatChange={(uses24HourClock) => controls.clockFormatMutation.mutate(uses24HourClock)}
    />
  )
}

function buildMoreRows({ context: { profile, router, t }, openWidget }: Readonly<{
  context: RowContext
  openWidget: () => void
}>) {
  const navigationRows = PROFILE_NAV_ITEMS.map((item) => {
    const redirectsToUpgrade = shouldRedirectProfileNavItem(item, profile)
    return (
      <ListRow
        key={item.id}
        compact={!item.hintKey}
        icon={<ProfileNavIcon iconKey={item.iconKey} />}
        title={t(item.titleKey)}
        description={item.hintKey ? t(item.hintKey) : undefined}
        trailing={item.proBadge && redirectsToUpgrade ? <ProBadge alwaysVisible /> : undefined}
        chevron={!redirectsToUpgrade}
        onClick={() => {
          if (item.action === 'openWidget') {
            openWidget()
            return
          }
          if (redirectsToUpgrade) {
            router.push(buildUpgradeHref('/profile'))
            return
          }
          router.push(item.route)
        }}
      />
    )
  })

  return navigationRows
}

interface EndingRowsOptions {
  context: RowContext
  onDeleteAccount: () => void
  onFreshStart: () => void
  onLogout: () => void
}

function buildEndingRows({
  context: { t },
  onDeleteAccount,
  onFreshStart,
  onLogout,
}: EndingRowsOptions) {
  return [
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 428 controls this label under D42. */
    <ListRow key="logout" compact icon={icon(LogOut)} title={t('profile.settingsRows.signOut')} chevron={false} onClick={onLogout} />,
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 429 controls this label under D42. */
    <ListRow key="fresh-start" compact icon={icon(RotateCcw)} title={t('profile.settingsRows.startOver')} chevron={false} onClick={onFreshStart} />,
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 430 controls this label under D42. */
    <ListRow key="delete" compact icon={icon(UserX)} title={t('profile.settingsRows.deleteAccount')} danger chevron={false} onClick={onDeleteAccount} />,
  ]
}

export function ProfileSettingsContent({
  profile,
  isLoading,
  patchProfile,
}: Readonly<ProfileSettingsContentProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const logout = useLogout()
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)
  const preferenceControls = usePreferenceControls()
  const pushPreferences = usePushNotifications()
  const pushSubscriptions = usePushSubscriptions(pushPreferences.expoPushToken)
  const refreshPushSubscriptions = pushSubscriptions.refresh
  useFocusEffect(useCallback(() => {
    void refreshPushSubscriptions()
  }, [refreshPushSubscriptions]))
  const { isSupported: pushSupported, refreshPermissionStatus } = pushPreferences
  useEffect(() => {
    if (!pushSupported) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermissionStatus()
    })
    return () => subscription.remove()
  }, [pushSupported, refreshPermissionStatus])
  async function handlePushToggle() {
    if (pushSubscriptions.isCurrentDeviceRegistered) {
      await pushPreferences.disablePushNotifications()
    } else if (pushPreferences.permissionStatus === 'denied') {
      await Linking.openSettings()
    } else {
      await pushPreferences.requestPermission()
    }
    await pushSubscriptions.refresh()
  }
  const tokens = useMemo(
    () => createTokensV2(preferenceControls.currentScheme, preferenceControls.currentTheme),
    [preferenceControls.currentScheme, preferenceControls.currentTheme],
  )
  const {
    isExporting,
    exportDone,
    exportError,
    exportData,
    clearExportDone,
  } = useDataExport()
  const [showEditName, setShowEditName] = useState(false)
  const [showFreshStart, setShowFreshStart] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [apiKeysUnlocked] = useState(() => isStepUpVerified('keys'))
  const astraSettings = useAstraSettingsController(profile, patchProfile)
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean | null>(null)
  const [analyticsSaveError, setAnalyticsSaveError] = useState(false)
  const analyticsChange = useRef(0)
  useEffect(() => {
    void getAnalyticsOptOut().then((optedOut) => {
      if (analyticsChange.current === 0) setAnalyticsEnabled(!optedOut)
    })
  }, [])
  const onToggleAnalytics = (next: boolean) => {
    const change = ++analyticsChange.current
    setAnalyticsEnabled(next)
    setAnalyticsSaveError(false)
    void setAnalyticsOptOut(!next).catch(() => {
      if (change !== analyticsChange.current) return
      void getAnalyticsOptOut().then((optedOut) => setAnalyticsEnabled(!optedOut))
      setAnalyticsSaveError(true)
      AccessibilityInfo.announceForAccessibility(t('profile.analytics.saveError'))
    })
  }
  useShellNoticeSlot(
    exportDone,
    () => (
      <Toast
        kind="done"
        message={t('dataExport.done')}
        onDone={clearExportDone}
      />
    ),
    exportDone ? 'export-done' : 'export-idle',
  )
  const context = { profile, router, t, tokens }
  const rows = {
    you: buildYouRows(
      context,
      exportError,
      isExporting,
      () => setShowEditName(true),
      () => void exportData(),
      () => preferenceControls.setActivePicker('timeZone'),
      preferenceControls,
    ),
    astra: buildAstraRows(context, astraSettings, apiKeysUnlocked),
    notifications: <View style={{ gap: 12 }}>
      <MarketingConsentSection
        showSectionLabel={false}
        contained
        trailingRow={analyticsEnabled === null ? null : (
          <SettingsRow
            icon={BarChart3}
            label={t('profile.analytics.title')}
            desc={analyticsSaveError ? t('profile.analytics.saveError') : undefined}
            accessory="none"
            divider={false}
          >
            <Switch checked={analyticsEnabled} onChange={onToggleAnalytics} label={t('profile.analytics.title')} />
          </SettingsRow>
        )}
      />
      <PushDevicesRow
        tokens={tokens}
        count={pushSubscriptions.count}
        max={pushSubscriptions.max}
        currentDeviceRegistered={pushSubscriptions.isCurrentDeviceRegistered}
        supported={pushPreferences.isSupported}
        loading={pushPreferences.isLoading || pushSubscriptions.isLoading}
        error={pushSubscriptions.isError}
        permissionStatus={pushPreferences.permissionStatus}
        registrationStatus={pushPreferences.registrationStatus}
        onToggle={() => void handlePushToggle()}
        onOpenSettings={() => void Linking.openSettings()}
        onRetry={() => void pushSubscriptions.refresh()}
      />
      <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 }}>
        {t('profile.settingsRows.remindersNote')}
      </Text>
    </View>,
    more: buildMoreRows({ context, openWidget: () => setShowWidgetInfo(true) }),
    ending: buildEndingRows({
      context,
      onDeleteAccount: () => setShowDeleteAccount(true),
      onFreshStart: () => setShowFreshStart(true),
      onLogout: () => void logout(),
    }),
  }

  return (
    <>
      <ProfileSettingsFrame
        isLoading={isLoading}
        loadingLabel={t('profile.loading')}
        labels={{
          you: t('profile.groups.you'),
          astra: t('profile.groups.astra'),
          notifications: t('profile.groups.notifications'),
          more: t('profile.groups.more'),
          ending: t('profile.groups.ending'),
        }}
        rows={rows}
        uncontainedGroups={['astra', 'notifications']}
      />
      <EditNameSheet open={showEditName} onClose={() => setShowEditName(false)} />
      <FreshStartModal open={showFreshStart} onClose={() => setShowFreshStart(false)} />
      <DeleteAccountModal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} profile={profile} />
      <WidgetInfoSheet open={showWidgetInfo} onClose={() => setShowWidgetInfo(false)} t={t} tokens={tokens} />
      <TimeZonePicker
        controls={preferenceControls}
        profile={profile}
        t={t}
        tokens={tokens}
      />
    </>
  )
}
