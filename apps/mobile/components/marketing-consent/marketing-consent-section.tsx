import { useMutation } from '@tanstack/react-query'
import { Mail } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

/** Self-contained "Product updates by email" preference row: reflects and optimistically toggles marketing-email consent through the offline queue, rolling back on error. Never Pro-gated. */
export function MarketingConsentSection() {
  const { t } = useTranslation()
  const { profile, patchProfile, invalidate } = useProfile()
  const enabled = profile?.marketingEmailConsent === true

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      performQueuedApiMutation({
        type: 'setMarketingConsent',
        scope: 'profile',
        endpoint: API.profile.marketingConsent,
        method: 'PUT',
        payload: { enabled: next },
        dedupeKey: 'profile-marketing-consent',
      }),
    onMutate: (next) => {
      const previous = profile?.marketingEmailConsent ?? null
      patchProfile({ marketingEmailConsent: next })
      return { previous }
    },
    onError: (
      _err: unknown,
      _next: boolean,
      context: { previous?: boolean | null } | undefined,
    ) => {
      patchProfile({ marketingEmailConsent: context?.previous ?? null })
    },
    onSettled: () => {
      invalidate()
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
          disabled={mutation.isPending}
          accessibilityLabel={t('profile.marketingEmails.title')}
        />
      </SettingsRow>
    </>
  )
}
