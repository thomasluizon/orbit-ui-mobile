import { useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Mail } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { API } from '@orbit/shared/api'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { PillButton } from '@/components/ui/pill-button'
import { RowList } from '@/components/ui/row-list'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type Translate = ReturnType<typeof useTranslation>['t']
type MarketingConsentStyles = ReturnType<typeof createStyles>

interface MarketingConsentContentProps {
  consent: boolean | null | undefined
  enabled: boolean
  isPending: boolean
  onChange: (enabled: boolean) => void
  styles: MarketingConsentStyles
  t: Translate
}

function MarketingConsentContent({
  consent,
  enabled,
  isPending,
  onChange,
  styles,
  t,
}: Readonly<MarketingConsentContentProps>) {
  if (consent == null) {
    return (
      <View style={styles.question}>
        <Text style={styles.questionTitle}>
          {t('profile.marketingEmails.question')}
        </Text>
        <Text style={styles.questionDescription}>
          {t('profile.marketingEmails.questionDescription')}
        </Text>
        <View style={styles.answers} pointerEvents={isPending ? 'none' : 'auto'}>
          <PillButton size="sm" disabled={isPending} onClick={() => onChange(true)}>
            {t('profile.marketingEmails.accept')}
          </PillButton>
          <PillButton
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => onChange(false)}
          >
            {t('profile.marketingEmails.decline')}
          </PillButton>
        </View>
      </View>
    )
  }

  return (
    <SettingsRow
      icon={Mail}
      label={t('profile.marketingEmails.title')}
      desc={t('profile.marketingEmails.description')}
      accessory="none"
      divider={false}
    >
      <View
        pointerEvents={isPending ? 'none' : 'auto'}
        accessible={isPending}
        accessibilityRole={isPending ? 'switch' : undefined}
        accessibilityLabel={isPending ? t('profile.marketingEmails.title') : undefined}
        accessibilityState={isPending ? { checked: enabled, disabled: true } : undefined}
      >
        <View
          accessibilityElementsHidden={isPending}
          importantForAccessibility={isPending ? 'no-hide-descendants' : 'auto'}
        >
          <Switch
            checked={enabled}
            onChange={onChange}
            label={t('profile.marketingEmails.title')}
          />
        </View>
      </View>
    </SettingsRow>
  )
}

/** Self-contained "Product updates by email" preference row: reflects and optimistically toggles marketing-email consent through the offline queue, rolling back on error. Never Pro-gated. */
export function MarketingConsentSection({
  showSectionLabel = true,
  contained = false,
}: Readonly<{ showSectionLabel?: boolean; contained?: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
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
  const content = (
    <MarketingConsentContent
      consent={profile?.marketingEmailConsent}
      enabled={enabled}
      isPending={mutation.isPending}
      onChange={mutation.mutate}
      styles={styles}
      t={t}
    />
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

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    question: {
      backgroundColor: tokens.bgWell,
      borderRadius: 12,
      gap: 12,
      padding: 16,
    },
    questionTitle: {
      color: tokens.fg1,
      fontFamily: 'Geist_500Medium',
      fontSize: 17,
      lineHeight: 23.8,
    },
    questionDescription: {
      color: tokens.fg2,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 21.7,
    },
    answers: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
  })
}
