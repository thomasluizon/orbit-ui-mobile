import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function HabitCreateActions({ presentation, pending, empty, subHabit, onCancel, onSubmit }: Readonly<{
  presentation: 'sheet' | 'screen'
  pending: boolean
  empty: boolean
  subHabit: boolean
  onCancel: () => void
  onSubmit: () => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const screen = presentation === 'screen'
  const reason = empty ? <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: screen ? 'center' : 'left' }}>{t('habits.form.createWhy')}</Text> : null
  return <View style={{ gap: screen ? 8 : 16 }}>
    {!screen ? reason : null}
      {screen ? (
        <PillButton size="md" loading={pending} disabled={empty}
        hint={empty ? t('habits.form.createWhy') : undefined} onClick={onSubmit}>
        {subHabit ? t('common.create') : t('habits.createHabit')}
      </PillButton>
      ) : (
        <ActionRow>
          <PillButton variant="ghost" disabled={pending} onClick={onCancel}>{t('common.cancel')}</PillButton>
          <PillButton size="sm" loading={pending}
        hint={empty ? t('habits.form.createWhy') : undefined} onClick={onSubmit}>
        {subHabit ? t('common.create') : t('habits.createHabit')}
      </PillButton>
        </ActionRow>
      )}
    {screen ? reason : null}
  </View>
}
