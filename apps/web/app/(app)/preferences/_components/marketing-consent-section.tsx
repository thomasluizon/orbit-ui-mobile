'use client'

import { useMutation } from '@tanstack/react-query'
import { Mail } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { useProfile } from '@/hooks/use-profile'
import { updateMarketingConsent } from '@/app/actions/profile'

/** Self-contained "Product updates by email" preference row: reflects and optimistically toggles marketing-email consent, rolling back on error. Never Pro-gated. */
export function MarketingConsentSection() {
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

  return (
    <>
      <SectionLabel>{t('profile.sections.communication')}</SectionLabel>
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
    </>
  )
}
