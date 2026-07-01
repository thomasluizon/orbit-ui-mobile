import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { challengeTypeSchema, type ChallengeType } from '@orbit/shared/types/challenge'
import { formatAPIDate } from '@orbit/shared/utils'
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

const createChallengeFormSchema = z
  .object({
    type: challengeTypeSchema,
    title: z.string().trim().min(1).max(80),
    targetCount: z.string().optional(),
    periodEndUtc: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'CoopGoal') return
    const target = Number(value.targetCount)
    if (!value.targetCount || !Number.isInteger(target) || target <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetCount'], message: 'required' })
    }
    if (!value.periodEndUtc) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEndUtc'], message: 'required' })
    }
  })

type CreateChallengeFormValues = z.infer<typeof createChallengeFormSchema>

const TYPE_OPTIONS: readonly ChallengeType[] = ['CoopGoal', 'StreakTogether']

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

  function toggleId(id: string, list: string[], set: (next: string[]) => void) {
    set(list.includes(id) ? list.filter((value) => value !== id) : [...list, id])
  }

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
              {TYPE_OPTIONS.map((option) => {
                const selected = field.value === option
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => field.onChange(option)}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor: selected ? tintFromPrimary(tokens, 0.12) : tokens.bgElev,
                        borderColor: selected ? tokens.primary : tokens.hairline,
                      },
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
        render={({ field }) => (
          <FieldInput
            label={t('challenges.create.nameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            placeholder={t('challenges.create.namePlaceholder')}
            maxLength={80}
          />
        )}
      />

      {isCoop ? (
        <>
          <Controller
            control={control}
            name="targetCount"
            render={({ field }) => (
              <FieldInput
                label={t('challenges.create.targetLabel')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                placeholder={t('challenges.create.targetPlaceholder')}
                keyboardType="number-pad"
                mono
              />
            )}
          />
          <Controller
            control={control}
            name="periodEndUtc"
            render={({ field }) => (
              <View style={styles.field}>
                <Text style={[styles.label, { color: tokens.fg2 }]}>
                  {t('challenges.create.endDateLabel')}
                </Text>
                <AppDatePicker
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder={t('challenges.create.endDatePlaceholder')}
                />
              </View>
            )}
          />
        </>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('challenges.create.habitsLabel')}</Text>
        <HabitPicker selectedIds={habitIds} onToggle={(id) => toggleId(id, habitIds, setHabitIds)} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('challenges.create.inviteLabel')}</Text>
        <InviteFriendsPicker
          selectedIds={friendIds}
          onToggle={(id) => toggleId(id, friendIds, setFriendIds)}
        />
      </View>

      <PillButton
        fullWidth
        onPress={handleSubmit(onSubmit)}
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeButtonText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
})
