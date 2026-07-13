import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { formatAPIDate, toggleSelectedId } from '@orbit/shared/utils'
import {
  CHALLENGE_TYPE_OPTIONS,
  createChallengeFormSchema,
  type CreateChallengeFormValues,
} from '@orbit/shared/validation'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateChallenge } from '@/hooks/use-challenges'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { getChallengeErrorKey } from './challenge-errors'
import { HabitPicker } from './habit-picker'
import { InviteFriendsPicker } from './invite-friends-picker'

interface CreateChallengeFormProps {
  onCreated: (id: string) => void
}

/** New-challenge form: type branches the required fields (CoopGoal needs target + end date), plus a
 *  habit multi-select and a friend invite picker. */
export function CreateChallengeForm({ onCreated }: Readonly<CreateChallengeFormProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { showError, showSuccess } = useAppToast()
  const createChallenge = useCreateChallenge()
  const [habitIds, setHabitIds] = useState<string[]>([])
  const [friendIds, setFriendIds] = useState<string[]>([])

  const { control, handleSubmit, watch } = useForm<CreateChallengeFormValues>({
    resolver: zodResolver(createChallengeFormSchema),
    defaultValues: { type: 'CoopGoal', title: '', targetCount: '', periodEndUtc: '' },
  })

  const type = watch('type')
  const isCoop = type === 'CoopGoal'

  async function onSubmit(values: CreateChallengeFormValues) {
    try {
      const result = await createChallenge.mutateAsync({
        type: values.type,
        title: values.title.trim(),
        targetCount: isCoop ? Number(values.targetCount) : undefined,
        periodStartUtc: formatAPIDate(new Date()),
        periodEndUtc: isCoop ? values.periodEndUtc : undefined,
        linkedHabitIds: habitIds,
        invitedFriendUserIds: friendIds.length > 0 ? friendIds : undefined,
      })
      showSuccess(t('challenges.create.success'))
      onCreated(result.id)
    } catch (error: unknown) {
      showError(t(getChallengeErrorKey(error)))
    }
  }

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <View style={styles.field}>
            <Text style={[styles.label, { color: tokens.fg2 }]}>{t('challenges.create.typeLabel')}</Text>
            <View style={styles.typeRow}>
              {CHALLENGE_TYPE_OPTIONS.map((option) => {
                const selected = field.value === option
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => field.onChange(option)}
                    style={({ pressed }) => [
                      styles.typeButton,
                      {
                        backgroundColor: selected ? tintFromPrimary(tokens, 0.12) : tokens.bgElev,
                        borderColor: selected ? tokens.primary : tokens.hairline,
                      },
                      pressed ? styles.typeButtonPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.typeButtonText, { color: selected ? tokens.primary : tokens.fg2 }]}
                    >
                      {option === 'CoopGoal'
                        ? t('challenges.type.coopGoal')
                        : t('challenges.type.streakTogether')}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={[styles.hint, { color: tokens.fg3 }]}>
              {isCoop
                ? t('challenges.type.coopGoalDescription')
                : t('challenges.type.streakTogetherDescription')}
            </Text>
          </View>
        )}
      />

      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <FieldInput
            label={t('challenges.create.nameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            placeholder={t('challenges.create.namePlaceholder')}
            maxLength={80}
            error={fieldState.error ? t('challenges.create.errors.titleRequired') : undefined}
          />
        )}
      />

      {isCoop ? (
        <>
          <Controller
            control={control}
            name="targetCount"
            render={({ field, fieldState }) => (
              <FieldInput
                label={t('challenges.create.targetLabel')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                placeholder={t('challenges.create.targetPlaceholder')}
                keyboardType="number-pad"
                mono
                error={fieldState.error ? t('challenges.create.errors.targetInvalid') : undefined}
              />
            )}
          />
          <Controller
            control={control}
            name="periodEndUtc"
            render={({ field, fieldState }) => (
              <View style={styles.field}>
                <Text style={[styles.label, { color: tokens.fg2 }]}>
                  {t('challenges.create.endDateLabel')}
                </Text>
                <AppDatePicker
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder={t('challenges.create.endDatePlaceholder')}
                />
                {fieldState.error ? (
                  <Text style={[styles.errorCaption, { color: tokens.statusBadText }]}>
                    {t('challenges.create.errors.endDateRequired')}
                  </Text>
                ) : null}
              </View>
            )}
          />
        </>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('challenges.create.habitsLabel')}</Text>
        <HabitPicker selectedIds={habitIds} onToggle={(id) => setHabitIds(toggleSelectedId(habitIds, id))} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('challenges.create.inviteLabel')}</Text>
        <InviteFriendsPicker
          selectedIds={friendIds}
          onToggle={(id) => setFriendIds(toggleSelectedId(friendIds, id))}
        />
      </View>

      <PillButton
        fullWidth
        onPress={() => void handleSubmit(onSubmit)()}
        disabled={createChallenge.isPending}
        busy={createChallenge.isPending}
      >
        {t('challenges.create.submit')}
      </PillButton>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  field: { gap: 8 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  hint: { fontFamily: 'Rubik_400Regular', fontSize: 13, lineHeight: 19 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonPressed: { transform: [{ scale: 0.98 }] },
  typeButtonText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  errorCaption: { fontFamily: 'Rubik_400Regular', fontSize: 12 },
})
