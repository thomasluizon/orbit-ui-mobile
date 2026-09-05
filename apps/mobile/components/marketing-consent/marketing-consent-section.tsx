import { useMutation } from '@tanstack/react-query'
import { Mail } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { API } from '@orbit/shared/api'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
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
      <SectionLabel>{t('profile.sections.communication')}</SectionLabel>
      <SettingsRow
        icon={Mail}
        label={t('profile.marketingEmails.title')}
        desc={t('profile.marketingEmails.description')}
        accessory="none"
        divider={false}
      >
        <View
          pointerEvents={mutation.isPending ? 'none' : 'auto'}
          accessible={mutation.isPending}
          accessibilityRole={mutation.isPending ? 'switch' : undefined}
          accessibilityLabel={mutation.isPending ? t('profile.marketingEmails.title') : undefined}
          accessibilityState={mutation.isPending ? { checked: enabled, disabled: true } : undefined}
        >
          <View
            accessibilityElementsHidden={mutation.isPending}
            importantForAccessibility={mutation.isPending ? 'no-hide-descendants' : 'auto'}
          >
            <Switch
              checked={enabled}
              onChange={(checked) => mutation.mutate(checked)}
              label={t('profile.marketingEmails.title')}
            />
          </View>
        </View>
      </SettingsRow>
    </>
  )
}
