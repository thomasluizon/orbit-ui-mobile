'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslations } from 'next-intl'
import { challengeTypeSchema, type ChallengeType } from '@orbit/shared/types/challenge'
import { formatAPIDate } from '@orbit/shared/utils'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateChallenge } from '@/hooks/use-challenges'
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
  const t = useTranslations()
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col" style={{ gap: 14 }}>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg-2)' }}>
              {t('challenges.create.typeLabel')}
            </span>
            <div className="flex" style={{ gap: 8 }}>
              {TYPE_OPTIONS.map((option) => {
                const selected = field.value === option
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => field.onChange(option)}
                    className={`flex-1 transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.98] motion-reduce:transition-none ${
                      selected
                        ? 'bg-[rgba(var(--primary-rgb),0.12)] shadow-[inset_0_0_0_1px_var(--primary)]'
                        : 'bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-elev-2)]'
                    }`}
                    style={{
                      padding: '10px 12px',
                      minHeight: 44,
                      borderRadius: 14,
                      border: 0,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      fontWeight: 500,
                      color: selected ? 'var(--primary)' : 'var(--fg-2)',
                    }}
                  >
                    {option === 'CoopGoal'
                      ? t('challenges.type.coopGoal')
                      : t('challenges.type.streakTogether')}
                  </button>
                )
              })}
            </div>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-3)' }}>
              {isCoop
                ? t('challenges.type.coopGoalDescription')
                : t('challenges.type.streakTogetherDescription')}
            </span>
          </div>
        )}
      />

      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <FieldInput
            label={t('challenges.create.nameLabel')}
            value={field.value}
            onChange={field.onChange}
            placeholder={t('challenges.create.namePlaceholder')}
            ariaLabel={t('challenges.create.nameLabel')}
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
                onChange={field.onChange}
                placeholder={t('challenges.create.targetPlaceholder')}
                ariaLabel={t('challenges.create.targetLabel')}
                type="number"
                inputMode="numeric"
                mono
                error={fieldState.error ? t('challenges.create.errors.targetInvalid') : undefined}
              />
            )}
          />
          <Controller
            control={control}
            name="periodEndUtc"
            render={({ field, fieldState }) => (
              <FieldInput
                label={t('challenges.create.endDateLabel')}
                value={field.value ?? ''}
                onChange={field.onChange}
                ariaLabel={t('challenges.create.endDateLabel')}
                type="date"
                error={fieldState.error ? t('challenges.create.errors.endDateRequired') : undefined}
              />
            )}
          />
        </>
      ) : null}

      <div>
        <SectionLabel top={4} bottom={8}>
          {t('challenges.create.habitsLabel')}
        </SectionLabel>
        <HabitPicker
          selectedIds={habitIds}
          onToggle={(id) => toggleId(id, habitIds, setHabitIds)}
        />
      </div>

      <div>
        <SectionLabel top={4} bottom={8}>
          {t('challenges.create.inviteLabel')}
        </SectionLabel>
        <InviteFriendsPicker
          selectedIds={friendIds}
          onToggle={(id) => toggleId(id, friendIds, setFriendIds)}
        />
      </div>

      <PillButton
        fullWidth
        className="sm:mx-auto sm:max-w-[360px]"
        type="submit"
        disabled={createChallenge.isPending}
        busy={createChallenge.isPending}
      >
        {t('challenges.create.submit')}
      </PillButton>
    </form>
  )
}
