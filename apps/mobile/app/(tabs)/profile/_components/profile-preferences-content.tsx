import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { buildProfilePickerLabels, buildClockFormatOptions, resolveHourCycle, deriveProfilePreferenceValues } from '@orbit/shared/utils'
import {
  ProfileValueRow,
} from '@/components/profile/profile-settings-frame'
import { ListRow } from '@/components/ui/list-row'
import { Switch } from '@/components/ui/switch'
import { usePreferenceControls } from '@/app/use-preference-controls'
import { PreferencePickerSheet } from '@/components/profile/preferences-sections'
import { useSheetHost } from '@/components/ui/sheet'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslation } from 'react-i18next'
import { RowList } from '@/components/ui/row-list'
import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslation>['t']
type Tokens = ReturnType<typeof createTokensV2>
interface RowContext { profile: Profile | undefined; t: Translate; tokens: Tokens }

function buildPreferenceRows(
  { profile, t, tokens }: RowContext,
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
          <Pressable selectionRingWidth={1.5}
            key={mode}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(mode === 'dark' ? 'preferences.themeModeDark' : 'preferences.themeModeLight')}
            onPress={() => controls.handleThemeModeChange(mode)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? tokens.primaryDim : pressed ? tokens.bgHover : tokens.bgWell, borderWidth: selected ? 1.5 : 1, borderColor: tokens.hairline })}
          >
            <Text style={{ color: selected ? tokens.fg1 : tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 }}>{t(mode === 'dark' ? 'preferences.themeModeDark' : 'preferences.themeModeLight')}</Text>
          </Pressable>
        )
      })}
    </View>
  )

  return [
    <ListRow key="timezone" compact textMode="label" chevron={false} title={t('profile.settingsRows.timezone')} accessibilityLabel={timeZoneLabel} value={profile?.timeZone ?? undefined} onClick={onOpenTimeZone} />,
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 99 controls this label under D42. */
    <ListRow key="week-start" compact textMode="label" chevron={false} title={t('profile.settingsRows.weekStart')} value={weekStartLabel} onClick={() => controls.setActivePicker('weekStart')} />,
    <ListRow key="clock" compact textMode="label" chevron={false} title={t('settings.clock.title')} value={profile ? buildClockFormatOptions(t).find((option) => option.value === (resolveHourCycle(profile.uses24HourClock, controls.selectedLanguage) === 'h23' ? '24h' : '12h'))?.label : undefined} onClick={() => controls.setActivePicker('clock')} />,
    <ListRow key="language" compact textMode="label" chevron={false} title={t('profile.language.title')} value={controls.selectedLanguage === 'pt-BR' ? t('profile.language.brazilianPortuguese') : languageLabel} onClick={() => controls.setActivePicker('language')} />,
    <ProfileValueRow key="theme" label={t('profile.settingsRows.theme')} control={themeChoice} />,
    <View key="show-general" style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text style={{ flex: 1, minWidth: 0, minHeight: TOUCH_TARGET_MIN, textAlignVertical: 'center', color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8 }}>{t('settings.homeScreen.showGeneral')}</Text>
        <Switch checked={controls.showGeneralOnToday} onChange={(next) => void controls.handleShowGeneralToggle(next)} label={t('settings.homeScreen.showGeneral')} />
      </View>
      <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 }}>{t('settings.homeScreen.showGeneralDesc')}</Text>
    </View>,
  ]
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

export function ProfilePreferencesContent({ profile }: Readonly<ProfileContentProps>) {
  const { t } = useTranslation()
  const controls = usePreferenceControls()
  const tokens = useMemo(() => createTokensV2(controls.currentScheme, controls.currentTheme), [controls.currentScheme, controls.currentTheme])
  return <>
    <RowList>{buildPreferenceRows({ profile, t, tokens }, () => controls.setActivePicker('timeZone'), controls)}</RowList>
    <TimeZonePicker controls={controls} profile={profile} t={t} tokens={tokens} />
  </>
}
