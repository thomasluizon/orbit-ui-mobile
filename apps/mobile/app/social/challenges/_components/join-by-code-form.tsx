import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useJoinChallenge } from '@/hooks/use-challenges'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { getChallengeErrorKey } from './challenge-errors'
import { HabitPicker } from './habit-picker'

interface JoinByCodeFormProps {
  initialCode?: string
  onJoined: () => void
}

/** Join a challenge by code and link the habits that should count toward it. */
export function JoinByCodeForm({ initialCode = '', onJoined }: Readonly<JoinByCodeFormProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { showError, showSuccess } = useAppToast()
  const joinChallenge = useJoinChallenge()
  const [code, setCode] = useState(initialCode)
  const [habitIds, setHabitIds] = useState<string[]>([])

  function toggleHabit(id: string) {
    setHabitIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }

  async function submit() {
    const trimmed = code.trim()
    if (!trimmed) return
    try {
      await joinChallenge.mutateAsync({ code: trimmed, linkedHabitIds: habitIds })
      showSuccess(t('challenges.join.success'))
      onJoined()
    } catch (error: unknown) {
      showError(t(getChallengeErrorKey(error)))
    }
  }

  return (
    <View style={styles.form}>
      <FieldInput
        label={t('challenges.join.codeLabel')}
        value={code}
        onChangeText={setCode}
        placeholder={t('challenges.join.codePlaceholder')}
        autoCapitalize="characters"
        maxLength={16}
        mono
      />

      <View style={styles.field}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('challenges.create.habitsLabel')}</Text>
        <HabitPicker selectedIds={habitIds} onToggle={toggleHabit} />
      </View>

      <PillButton
        fullWidth
        onPress={submit}
        disabled={joinChallenge.isPending || code.trim().length === 0}
        busy={joinChallenge.isPending}
      >
        {t('challenges.join.submit')}
      </PillButton>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  field: { gap: 8 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
})
