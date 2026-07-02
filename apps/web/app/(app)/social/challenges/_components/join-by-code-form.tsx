'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppToast } from '@/hooks/use-app-toast'
import { useJoinChallenge } from '@/hooks/use-challenges'
import { getChallengeErrorKey } from './challenge-errors'
import { HabitPicker } from './habit-picker'

interface JoinByCodeFormProps {
  initialCode?: string
  onJoined: () => void
}

/** Join a challenge by code and link the habits that should count toward it. */
export function JoinByCodeForm({ initialCode = '', onJoined }: Readonly<JoinByCodeFormProps>) {
  const t = useTranslations()
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
    <div className="flex flex-col" style={{ gap: 14 }}>
      <FieldInput
        label={t('challenges.join.codeLabel')}
        value={code}
        onChange={setCode}
        placeholder={t('challenges.join.codePlaceholder')}
        ariaLabel={t('challenges.join.codeLabel')}
        maxLength={16}
        mono
      />

      <div>
        <SectionLabel top={4} bottom={8}>
          {t('challenges.create.habitsLabel')}
        </SectionLabel>
        <HabitPicker selectedIds={habitIds} onToggle={toggleHabit} />
      </div>

      <PillButton
        fullWidth
        className="sm:mx-auto sm:max-w-[360px]"
        onClick={submit}
        disabled={joinChallenge.isPending || code.trim().length === 0}
        busy={joinChallenge.isPending}
      >
        {t('challenges.join.submit')}
      </PillButton>
    </div>
  )
}
