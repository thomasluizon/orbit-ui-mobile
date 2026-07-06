'use client'

import { useMutation } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { useProfile } from '@/hooks/use-profile'
import { updateMarketingConsent } from '@/app/actions/profile'

/** Self-contained "Product updates by email" preference row: reflects and optimistically toggles marketing-email consent, rolling back on error. Never Pro-gated. */
export function MarketingConsentSection() {
  const t = useTranslations()
  const { profile, patchProfile } = useProfile()
  const enabled = profile?.marketingEmailConsent === true

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
      <SectionLabel bottom={4}>{t('profile.sections.communication')}</SectionLabel>
      <SettingsRow
        icon={Mail}
        label={t('profile.marketingEmails.title')}
        desc={t('profile.marketingEmails.description')}
        accessory="none"
        divider={false}
      >
        <Switch
          on={enabled}
          onToggle={() => mutation.mutate(!enabled)}
          ariaLabel={t('profile.marketingEmails.title')}
          disabled={mutation.isPending}
        />
      </SettingsRow>
    </>
  )
}
