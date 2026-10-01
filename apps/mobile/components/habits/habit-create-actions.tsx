import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'
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
  const ActionContainer = screen ? View : DialogActionPair
  const reason = empty ? <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: screen ? 'center' : 'left' }}>{t('habits.form.createWhy')}</Text> : null
  return <View style={{ gap: screen ? 8 : 16 }}>
    {!screen ? reason : null}
    <ActionContainer>
      {presentation === 'sheet' ? <PillButton size="sm" variant="ghost" disabled={pending} onClick={onCancel}>{t('common.cancel')}</PillButton> : null}
      <PillButton size={screen ? 'md' : 'sm'} loading={pending} disabled={screen && empty}
        hint={empty ? t('habits.form.createWhy') : undefined} onClick={onSubmit}>
        {subHabit ? t('common.create') : t('habits.createHabit')}
      </PillButton>
    </ActionContainer>
    {screen ? reason : null}
  </View>
}
