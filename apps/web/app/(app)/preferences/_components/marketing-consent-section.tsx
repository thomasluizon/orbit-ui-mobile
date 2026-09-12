'use client'

import { useMutation } from '@tanstack/react-query'
import { Mail } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { PillButton } from '@/components/ui/pill-button'
import { RowList } from '@/components/ui/row-list'
import { useProfile } from '@/hooks/use-profile'
import { updateMarketingConsent } from '@/app/actions/profile'

/** Self-contained "Product updates by email" preference row: reflects and optimistically toggles marketing-email consent, rolling back on error. Never Pro-gated. */
export function MarketingConsentSection({
  showSectionLabel = true,
  contained = false,
  acceptVariant = 'primary',
}: Readonly<{
  showSectionLabel?: boolean
  contained?: boolean
  acceptVariant?: 'primary' | 'secondary'
}>) {
  const t = useTranslations()
  const { profile, patchProfile } = useProfile()
  const enabled = profile?.marketingEmailConsent === true

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- optimistic cache update via patchProfile (setQueryData) + onError rollback keeps the profile cache in sync; no dependent query to refetch https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const mutation = useMutation({
    mutationFn: (next: boolean) => updateMarketingConsent({ enabled: next }),
    onMutate: (next) => {
      const previous = profile?.marketingEmailConsent ?? null
      patchProfile({ marketingEmailConsent: next })
      return { previous }
    },
    onError: (_error, _next, context) => {
      patchProfile({ marketingEmailConsent: context?.previous ?? null })
    },
  })
  const content = profile?.marketingEmailConsent == null ? (
    <div
      className="flex flex-col bg-[var(--bg-well)] p-4"
      style={{ gap: 12, borderRadius: 12 }}
    >
      <p className="m-0 font-sans text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">
        {t('profile.marketingEmails.question')}
      </p>
      <p className="m-0 font-sans text-sm leading-[1.55] text-[var(--fg-2)]">
        {t('profile.marketingEmails.questionDescription')}
      </p>
      <fieldset
        disabled={mutation.isPending}
        className="m-0 flex flex-wrap gap-2 border-0 p-0"
      >
        {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
        <PillButton size="sm" variant={acceptVariant} onClick={() => mutation.mutate(true)}>
          {t('profile.marketingEmails.accept')}
        </PillButton>
        <PillButton size="sm" variant="ghost" onClick={() => mutation.mutate(false)}>
          {t('profile.marketingEmails.decline')}
        </PillButton>
      </fieldset>
    </div>
  ) : (
    <SettingsRow
      icon={Mail}
      label={t('profile.marketingEmails.title')}
      desc={t('profile.marketingEmails.description')}
      accessory="none"
      divider={false}
    >
      <fieldset disabled={mutation.isPending} className="m-0 border-0 p-0">
        <Switch
          checked={enabled}
          onChange={(checked) => mutation.mutate(checked)}
          label={t('profile.marketingEmails.title')}
        />
      </fieldset>
    </SettingsRow>
  )

  return (
    <>
      {showSectionLabel ? (
        <SectionLabel>{t('profile.sections.communication')}</SectionLabel>
      ) : null}
      {contained && profile?.marketingEmailConsent != null ? (
        <RowList>{content}</RowList>
      ) : content}
    </>
  )
}
