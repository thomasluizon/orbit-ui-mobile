'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { WidgetInfoOverlay } from '@/components/advanced/advanced-sections'
import type { Profile } from '@orbit/shared/types/profile'
import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import { usePushNotificationPreferences } from '@/hooks/use-push-notification-preferences'
import { buildProfilePickerLabels, buildWeekStartOptions, deriveProfileAstraFeatures, deriveProfilePreferenceValues } from '@orbit/shared/utils'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import {
  Calendar,
  BarChart3,
  Clock,
  CreditCard,
  Download,
  Languages,
  Lock,
  LogOut,
  RotateCcw,
  User,
  UserX,
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
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { ProBadge } from '@/components/ui/pro-badge'
import { Toast } from '@/components/ui/toast'
import { useAuthStore } from '@/stores/auth-store'
import { useIsClient } from '@/hooks/use-is-client'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { isStepUpVerified } from '@/lib/step-up-storage'
import { getAnalyticsOptOut, setAnalyticsOptOut, subscribeAnalyticsOptOut } from '@/lib/posthog'
import { MarketingConsentSection } from '@/app/(app)/preferences/_components/marketing-consent-section'
import { PushNotificationSection } from '@/app/(app)/preferences/_components/push-notification-section'
import { PreferencePickerSheet } from '@/app/(app)/preferences/_components/preference-picker-sheet'
import { usePreferenceControls } from '@/app/(app)/preferences/_components/use-preference-controls'
import { DeleteAccountModal } from './delete-account-modal'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { useDataExport } from './use-data-export'

interface ProfileSettingsContentProps {
  profile: Profile | undefined
  isLoading: boolean
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslations>
type Router = ReturnType<typeof useRouter>

interface RowContext {
  profile: Profile | undefined
  router: Router
  t: Translate
}

const icon = (Icon: typeof User) => (
  <Icon size={24} strokeWidth={1.8} color="var(--fg-1)" />
)

const getServerAnalyticsOptOut = () => null

function buildYouRows(
  { profile, router, t }: RowContext,
  exportError: string | null,
  isExporting: boolean,
  onEditName: () => void,
  onExport: () => void,
  onOpenTimeZone: () => void,
  controls: ReturnType<typeof usePreferenceControls>,
) {
  const { planLabelKey, timeZone, languageLabel, weekStartLabel } = deriveProfilePreferenceValues({
    profile,
    selectedLanguage: controls.selectedLanguage,
    weekStartOptions: buildWeekStartOptions(t),
  })
  const timeZoneLabel = timeZone
    ? t('profile.settingsRows.timezoneValue', { timeZone })
    : t('profile.settingsRows.timezone')
  const themeChoice = (
    <div role="group" aria-label={t('preferences.themeMode')} className="flex max-w-full flex-wrap gap-1">
      {(['dark', 'light'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          data-selected={controls.currentTheme === mode ? '' : undefined}
          aria-pressed={controls.currentTheme === mode}
          onClick={() => controls.handleThemeModeChange(mode)}
          className="orbit-profile-theme-choice min-h-11 rounded-full px-3 font-sans text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          {t(mode === 'dark' ? 'preferences.themeModeDark' : 'preferences.themeModeLight')}
        </button>
      ))}
    </div>
  )

  return [
    <ListRow key="account" icon={icon(User)} title={profile?.name ?? t('profile.editName.title')} accessibilityLabel={t('profile.settingsRows.editName', { name: profile?.name ?? '', email: profile?.email ?? '' })} description={profile?.email} onClick={onEditName} />,
    <ListRow key="language" icon={icon(Languages)} title={t('profile.language.title')} value={languageLabel} onClick={() => controls.setActivePicker('language')} />,
    <ListRow key="timezone" icon={icon(Clock)} title={t('profile.settingsRows.timezone')} accessibilityLabel={timeZoneLabel} value={profile?.timeZone ?? undefined} onClick={onOpenTimeZone} />,
    <ListRow key="week-start" icon={icon(Calendar)} title={t('settings.weekStartDay.title')} value={weekStartLabel} onClick={() => controls.setActivePicker('weekStart')} />,
    <ProfileValueRow key="theme" label={t('preferences.themeMode')} control={themeChoice} />,
    <div key="show-general" className="flex flex-col px-4 py-3" style={{ gap: 4 }}>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[17px] text-[var(--fg-1)]">{t('settings.homeScreen.showGeneral')}</p>
        <Switch checked={controls.showGeneralOnToday} onChange={controls.toggleShowGeneral} label={t('settings.homeScreen.showGeneral')} />
      </div>
      <p className="text-sm text-[var(--fg-3)]">{t('settings.homeScreen.showGeneralDesc')}</p>
    </div>,
    <ListRow key="plan" icon={icon(CreditCard)} title={t('profile.subscription.plan')} value={t(planLabelKey)} onClick={() => router.push('/upgrade')} />,
    <ListRow key="export" icon={icon(Download)} title={t('dataExport.button')} value={isExporting ? t('dataExport.preparing') : undefined} description={exportError ?? undefined} chevron={false} onClick={onExport} />,
  ]
}

function buildAstraRows(
  { profile, router, t }: RowContext,
  settings: AstraSettingsController,
  apiKeysUnlocked: boolean,
) {
  const onUpgrade = () => router.push('/upgrade')
  const astraFeatures = deriveProfileAstraFeatures(Boolean(profile?.hasProAccess), settings)
  return (
    <div className="flex flex-col" style={{ gap: 32 }}>
      <div className="flex flex-col" style={{ gap: 12 }}>
      {profile ? (
        <AstraAllowancePanel profile={profile} />
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
            <ListRow key={feature.key} icon={icon(Lock)} title={t(feature.labelKey)} trailing={<ProBadge alwaysVisible />} chevron={false} onClick={onUpgrade} />
          ))}
        </RowList>
      ) : null}
      </div>
      <ProfileApiKeys profile={profile} unlocked={apiKeysUnlocked} />
    </div>
  )
}

interface TimeZonePickerProps {
  controls: ReturnType<typeof usePreferenceControls>
  mounted: boolean
  profile: Profile | undefined
  t: Translate
}

function TimeZonePicker({ controls, mounted, profile, t }: Readonly<TimeZonePickerProps>) {
  const pickerLabels = buildProfilePickerLabels(t)

  return (
    <PreferencePickerSheet
      activePicker={controls.activePicker}
      mounted={mounted}
      selectedLanguage={controls.selectedLanguage}
      currentTheme={controls.currentTheme}
      timeZone={profile?.timeZone}
      weekStartDay={profile?.weekStartDay}
      {...pickerLabels}
      onClose={() => controls.setActivePicker(null)}
      onLanguageChange={(locale) => void controls.handleLanguageChange(locale)}
      onThemeModeChange={controls.handleThemeModeChange}
      onTimeZoneChange={(timeZone) => controls.timeZoneMutation.mutate(timeZone)}
      onWeekStartChange={(day) => controls.weekStartMutation.mutate(day)}
    />
  )
}

function buildMoreRows({ profile, t }: RowContext, openWidget: () => void) {
  const navigationRows = PROFILE_NAV_ITEMS.map((item) => {
    const redirectsToUpgrade = shouldRedirectProfileNavItem(item, profile)
    const href = redirectsToUpgrade ? '/upgrade' : item.route ?? undefined
    return (
      <ListRow
        key={item.id}
        icon={<ProfileNavIcon iconKey={item.iconKey} />}
        title={t(item.titleKey)}
        description={item.hintKey ? t(item.hintKey) : undefined}
        trailing={item.proBadge && redirectsToUpgrade ? <ProBadge alwaysVisible /> : undefined}
        chevron={!redirectsToUpgrade}
        href={href}
        onClick={item.action === 'openWidget' ? openWidget : undefined}
      />
    )
  })

  return [
    ...navigationRows,
    <ShareCardEntryButton key="share" />,
  ]
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
    <ListRow key="logout" icon={icon(LogOut)} title={t('profile.logout')} chevron={false} onClick={onLogout} />,
    <ListRow key="fresh-start" icon={icon(RotateCcw)} title={t('profile.freshStart.button')} chevron={false} onClick={onFreshStart} />,
    <ListRow key="delete" icon={icon(UserX)} title={t('profile.deleteAccount.button')} danger chevron={false} onClick={onDeleteAccount} />,
  ]
}

export function ProfileSettingsContent({
  profile,
  isLoading,
  patchProfile,
}: Readonly<ProfileSettingsContentProps>) {
  const t = useTranslations()
  const router = useRouter()
  const mounted = useIsClient()
  const logout = useAuthStore((state) => state.logout)
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)
  const preferenceControls = usePreferenceControls()
  const pushPreferences = usePushNotificationPreferences()
  const {
    isExporting,
    exportDone,
    exportError,
    exportData,
    clearExportDone,
  } = useDataExport()
  const [showEditName, setShowEditName] = useAccountScopedState(false)
  const [showFreshStart, setShowFreshStart] = useAccountScopedState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useAccountScopedState(false)
  const [apiKeysUnlocked] = useAccountScopedState(() => isStepUpVerified('keys'))
  const astraSettings = useAstraSettingsController(profile, patchProfile)
  const optedOut = useSyncExternalStore(subscribeAnalyticsOptOut, getAnalyticsOptOut, getServerAnalyticsOptOut)
  const analyticsEnabled = optedOut === null ? null : !optedOut
  const [analyticsSaveError, setAnalyticsSaveError] = useState(false)
  const analyticsChange = useRef(0)
  const onToggleAnalytics = (next: boolean) => {
    const change = ++analyticsChange.current
    setAnalyticsSaveError(false)
    void setAnalyticsOptOut(!next).catch(() => {
      if (change !== analyticsChange.current) return
      setAnalyticsSaveError(true)
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
  const context = { profile, router, t }
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
    notifications: <div className="flex flex-col" style={{ gap: 12 }}>
      <MarketingConsentSection
        showSectionLabel={false}
        contained
        acceptVariant="secondary"
        trailingRow={analyticsEnabled === null ? null : (
          <SettingsRow
            icon={BarChart3}
            label={t('profile.analytics.title')}
            desc={t(analyticsSaveError ? 'profile.analytics.saveError' : 'profile.analytics.description')}
            accessory="none"
            divider={false}
          >
            <Switch checked={analyticsEnabled} onChange={onToggleAnalytics} label={t('profile.analytics.title')} />
            <span role="status" className="sr-only">
              {analyticsSaveError ? t('profile.analytics.saveError') : ''}
            </span>
          </SettingsRow>
        )}
      />
      <PushNotificationSection
        push={{
          supported: pushPreferences.supported,
          subscribed: pushPreferences.subscribed,
          permission: pushPreferences.permission,
          loading: pushPreferences.loading,
          status: pushPreferences.status,
          onToggle: () => void pushPreferences.togglePush(),
        }}
        showSectionLabel={false}
        contained
      />
    </div>,
    more: buildMoreRows(context, () => setShowWidgetInfo(true)),
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
      <EditNameSheet open={showEditName} onOpenChange={setShowEditName} />
      <FreshStartModal open={showFreshStart} onOpenChange={setShowFreshStart} />
      <DeleteAccountModal open={showDeleteAccount} onOpenChange={setShowDeleteAccount} profile={profile} />
      <WidgetInfoOverlay open={showWidgetInfo} onOpenChange={setShowWidgetInfo} t={t} />
      <TimeZonePicker
        controls={preferenceControls}
        mounted={mounted}
        profile={profile}
        t={t}
      />
    </>
  )
}
