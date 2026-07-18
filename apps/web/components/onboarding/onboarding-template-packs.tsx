'use client'

import { useCallback, useState } from 'react'
import { Check, ChevronRight, Loader2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import {
  buildBulkItemsFromPack,
  getFriendlyErrorMessage,
  getTemplatePackById,
  TEMPLATE_PACKS,
  templatePackDescriptionKey,
  templatePackHabitTitleKey,
  templatePackNameKey,
} from '@orbit/shared/utils'
import { useOnboardingActions } from './onboarding-actions-context'
import { useAppToast } from '@/hooks/use-app-toast'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'

interface OnboardingTemplatePacksProps {
  onCreated: () => void
  onCreateOwn: () => void
  onSkip: () => void
}

export function OnboardingTemplatePacks({
  onCreated,
  onCreateOwn,
  onSkip,
}: Readonly<OnboardingTemplatePacksProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const actions = useOnboardingActions()
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [disabledKeys, setDisabledKeys] = useState<ReadonlySet<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)

  const selectedPack = selectedPackId ? getTemplatePackById(selectedPackId) : undefined

  const toggleHabit = useCallback((key: string) => {
    setDisabledKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const enabledCount = selectedPack
    ? selectedPack.habits.filter((habit) => !disabledKeys.has(habit.key)).length
    : 0

  const handleAdd = useCallback(async () => {
    if (!selectedPack || enabledCount === 0 || isCreating) return
    const items = buildBulkItemsFromPack(selectedPack, disabledKeys, translate)
    setIsCreating(true)
    try {
      await actions.createHabitsBulk(items)
      onCreated()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'errors.createHabit', 'habit'))
    } finally {
      setIsCreating(false)
    }
  }, [selectedPack, enabledCount, isCreating, disabledKeys, translate, actions, onCreated, showError])

  if (!selectedPack) {
    return (
      <div
        className="stagger-enter"
        style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '16px 0' }}
      >
        <Heading title={t('onboarding.flow.templatePacks.title')} subtitle={t('onboarding.flow.templatePacks.subtitle')} />

        <div className="flex flex-col" style={{ gap: 12 }}>
          {TEMPLATE_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setSelectedPackId(pack.id)}
              className="card-int flex w-full appearance-none items-center border-0 text-left"
              style={{ padding: 16, gap: 12 }}
            >
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{ width: 44, height: 44, fontSize: 22, background: 'rgba(var(--primary-rgb), 0.15)' }}
              >
                {pack.emoji}
              </span>
              <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
                <span className="t-body font-medium">
                  {t(templatePackNameKey(pack.id))}
                </span>
                <span className="t-secondary">
                  {t(templatePackDescriptionKey(pack.id))}
                </span>
              </span>
              <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center" style={{ gap: 4, marginTop: 4 }}>
          <QuietLink onClick={onCreateOwn} emphasized>
            {t('onboarding.flow.templatePacks.createOwn')}
          </QuietLink>
          <QuietLink onClick={onSkip}>
            {t('onboarding.flow.templatePacks.skip')}
          </QuietLink>
        </div>
      </div>
    )
  }

  return (
    <div
      className="stagger-enter"
      style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '16px 0' }}
    >
      <Heading
        title={t('onboarding.flow.templatePacks.customizeTitle')}
        subtitle={t('onboarding.flow.templatePacks.customizeSubtitle')}
      />

      <div className="flex flex-col" style={{ gap: 8 }}>
        {selectedPack.habits.map((habit) => {
          const enabled = !disabledKeys.has(habit.key)
          return (
            <button
              key={habit.key}
              type="button"
              data-enabled={enabled}
              aria-pressed={enabled}
              onClick={() => toggleHabit(habit.key)}
              className="flex w-full appearance-none items-center border-0 text-left bg-[var(--bg-elev)] cursor-pointer transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-2)] active:scale-[0.99]"
              style={{
                gap: 12,
                padding: '12px 16px',
                borderRadius: 14,
                opacity: enabled ? 1 : 0.55,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 20 }}>
                {habit.emoji}
              </span>
              <span className="t-body min-w-0 flex-1">
                {t(templatePackHabitTitleKey(selectedPack.id, habit.key))}
              </span>
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  background: enabled ? 'var(--primary)' : 'transparent',
                  boxShadow: enabled ? 'none' : 'inset 0 0 0 2px var(--hairline-strong)',
                }}
              >
                {enabled ? <Check size={14} strokeWidth={2.4} color="var(--fg-on-primary)" /> : null}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-center" style={{ gap: 4 }}>
        <PillButton
          fullWidth
          disabled={enabledCount === 0 || isCreating}
          busy={isCreating}
          onClick={() => void handleAdd()}
          leading={isCreating ? <Loader2 className="size-4 animate-spin" /> : undefined}
        >
          {enabledCount === 1
            ? t('onboarding.flow.templatePacks.createCtaOne')
            : t('onboarding.flow.templatePacks.createCta', { count: enabledCount })}
        </PillButton>
        <QuietLink onClick={() => setSelectedPackId(null)}>
          {t('onboarding.flow.back')}
        </QuietLink>
      </div>
    </div>
  )
}

interface HeadingProps {
  title: string
  subtitle: string
}

function Heading({ title, subtitle }: Readonly<HeadingProps>) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="t-h2 text-center text-balance">{title}</div>
      <div className="t-secondary text-center text-balance">{subtitle}</div>
    </div>
  )
}

