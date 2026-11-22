'use client'

import type { ReactNode } from 'react'
import { Mail } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { ListRow } from '@/components/ui/list-row'
import { OptionCard } from '@/components/ui/option-card'
import { RowList } from '@/components/ui/row-list'
import { useProfile } from '@/hooks/use-profile'
import { updateMarketingConsent } from '@/lib/actions/profile'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

/** Self-contained "Product updates by email" preference row: reflects and optimistically toggles marketing-email consent, rolling back on error. Never Pro-gated. */
export function MarketingConsentSection({
  showSectionLabel = true,
  contained = false,
  trailingRow,
}: Readonly<{
  showSectionLabel?: boolean
  contained?: boolean
  acceptVariant?: 'primary' | 'secondary'
  trailingRow?: ReactNode
}>) {
  const t = useTranslations()
  const { profile, patchProfile } = useProfile()
  const enabled = profile?.marketingEmailConsent === true

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- optimistic cache update via patchProfile (setQueryData) + onError rollback keeps the profile cache in sync; no dependent query to refetch https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const mutation = useAccountScopedMutation({
    mutationFn: (next: boolean, intendedAccountId) =>
      updateMarketingConsent({ enabled: next }, intendedAccountId),
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
      <div role="group" aria-label={t('profile.marketingEmails.question')} data-option-group="" className="grid grid-cols-2 gap-3">
          <OptionCard label={t('profile.marketingEmails.decline')} disabled={mutation.isPending} onSelect={() => mutation.mutate(false)} />
          <OptionCard label={t('profile.marketingEmails.accept')} disabled={mutation.isPending} onSelect={() => mutation.mutate(true)} />
        </div>
    </div>
  ) : (
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil emailOn controls this label under D42. */
    <ListRow textMode="label" icon={contained ? undefined : <Mail size={24} />} title={t('profile.marketingEmails.title')} chevron={false} toggle={{ checked: enabled, pending: mutation.isPending, onChange: (checked) => mutation.mutate(checked) }} />
  )

  return (
    <>
      {showSectionLabel ? (
        <SectionLabel>{t('profile.sections.communication')}</SectionLabel>
      ) : null}
      {contained && profile?.marketingEmailConsent != null ? (
        <RowList>{content}{trailingRow}</RowList>
      ) : (
        <>
          {content}
          {trailingRow ? <RowList>{trailingRow}</RowList> : null}
        </>
      )}
    </>
  )
}
