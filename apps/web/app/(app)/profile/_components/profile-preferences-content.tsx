'use client'

import { buildProfilePickerLabels, buildClockFormatOptions, resolveHourCycle, deriveProfilePreferenceValues } from '@orbit/shared/utils'
import {
  ProfileValueRow,
} from '@/components/profile/profile-settings-frame'
import { ListRow } from '@/components/ui/list-row'
import { Switch } from '@/components/ui/switch'
import { useIsClient } from '@/hooks/use-is-client'
import { PreferencePickerSheet } from '@/app/(app)/preferences/_components/preference-picker-sheet'
import { usePreferenceControls } from '@/app/(app)/preferences/_components/use-preference-controls'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslations } from 'next-intl'
import { RowList } from '@/components/ui/row-list'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslations>
interface RowContext { profile: Profile | undefined; t: Translate }

function buildPreferenceRows(
  { profile, t }: RowContext,
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
    <div role="group" aria-label={t('profile.settingsRows.theme')} className="flex max-w-full flex-wrap gap-1">
      {(['dark', 'light'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          data-selected={controls.currentTheme === mode ? '' : undefined}
          aria-pressed={controls.currentTheme === mode}
          onClick={() => controls.handleThemeModeChange(mode)}
          className="orbit-profile-theme-choice min-h-[var(--touch-min)] rounded-full px-3 font-sans text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          {t(mode === 'dark' ? 'preferences.themeModeDark' : 'preferences.themeModeLight')}
        </button>
      ))}
    </div>
  )

  return [
    <ListRow key="timezone" compact textMode="label" chevron={false} title={t('profile.settingsRows.timezone')} accessibilityLabel={timeZoneLabel} value={profile?.timeZone ?? undefined} onClick={onOpenTimeZone} />,
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 99 controls this label under D42. */
    <ListRow key="week-start" compact textMode="label" chevron={false} title={t('profile.settingsRows.weekStart')} value={weekStartLabel} onClick={() => controls.setActivePicker('weekStart')} />,
    <ListRow key="clock" compact textMode="label" chevron={false} title={t('settings.clock.title')} value={profile ? buildClockFormatOptions(t).find((option) => option.value === (resolveHourCycle(profile.uses24HourClock, controls.selectedLanguage) === 'h23' ? '24h' : '12h'))?.label : undefined} onClick={() => controls.setActivePicker('clock')} />,
    <ListRow key="language" compact textMode="label" chevron={false} title={t('profile.language.title')} value={controls.selectedLanguage === 'pt-BR' ? t('profile.language.brazilianPortuguese') : languageLabel} onClick={() => controls.setActivePicker('language')} />,
    <ProfileValueRow key="theme" label={t('profile.settingsRows.theme')} control={themeChoice} />,
    <div key="show-general" className="flex flex-col px-4 py-3" style={{ gap: 4 }}>
      <div className="flex items-start gap-3">
        <p className="flex min-h-12 min-w-0 flex-1 items-center text-[17px] text-[var(--fg-1)]">{t('settings.homeScreen.showGeneral')}</p>
        <Switch checked={controls.showGeneralOnToday} onChange={controls.toggleShowGeneral} label={t('settings.homeScreen.showGeneral')} />
      </div>
      <p className="text-sm text-[var(--fg-3)]">{t('settings.homeScreen.showGeneralDesc')}</p>
    </div>,
  ]
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
      uses24HourClock={profile?.uses24HourClock}
      {...pickerLabels}
      onClose={() => controls.setActivePicker(null)}
      onLanguageChange={(locale) => void controls.handleLanguageChange(locale)}
      onThemeModeChange={controls.handleThemeModeChange}
      onTimeZoneChange={(timeZone) => controls.timeZoneMutation.mutate(timeZone)}
      onWeekStartChange={(day) => controls.weekStartMutation.mutate(day)}
      onClockFormatChange={(uses24HourClock) => controls.clockFormatMutation.mutate(uses24HourClock)}
    />
  )
}

export function ProfilePreferencesContent({ profile }: Readonly<ProfileContentProps>) {
  const t = useTranslations()
  const controls = usePreferenceControls()
  const mounted = useIsClient()
  return <>
    <RowList>{buildPreferenceRows({ profile, t }, () => controls.setActivePicker('timeZone'), controls)}</RowList>
    <TimeZonePicker controls={controls} profile={profile} t={t} mounted={mounted} />
  </>
}
