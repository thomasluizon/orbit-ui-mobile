import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Check, Copy, RefreshCw, Share2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { UpdatePublicProfileRequest } from '@orbit/shared/types/public-profile'
import { useProfile } from '@/hooks/use-profile'
import { usePublicProfileSettings } from '@/hooks/use-public-profile-settings'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { PillButton } from '@/components/ui/pill-button'

const VISIBILITY_FIELDS = [
  { field: 'showStreak', i18nKey: 'streak' },
  { field: 'showLevel', i18nKey: 'level' },
  { field: 'showAchievements', i18nKey: 'achievements' },
  { field: 'showTopHabits', i18nKey: 'topHabits' },
] as const

export default function PublicProfileScreen() {
  const { t } = useTranslation()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const mutation = usePublicProfileSettings()
  const { showError } = useAppToast()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [copied, setCopied] = useState(false)

  const settings = profile?.publicProfile
  const enabled = settings?.enabled ?? false
  const shareUrl = settings?.shareUrl ?? null

  function submit(next: Partial<UpdatePublicProfileRequest>) {
    mutation.mutate(
      {
        enabled,
        showStreak: settings?.showStreak ?? true,
        showLevel: settings?.showLevel ?? true,
        showAchievements: settings?.showAchievements ?? true,
        showTopHabits: settings?.showTopHabits ?? false,
        regenerate: false,
        ...next,
      },
      { onError: () => showError(t('profile.publicProfile.error')) },
    )
  }

  function copyLink() {
    if (!shareUrl) return
    Clipboard.setString(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareLink() {
    if (!shareUrl) return
    try {
      await Share.share({ title: t('profile.publicProfile.title'), message: shareUrl })
    } catch {
    }
  }

  function confirmRegenerate() {
    Alert.alert(
      t('profile.publicProfile.regenerate.confirmTitle'),
      t('profile.publicProfile.regenerate.confirmBody'),
      [
        { text: t('profile.publicProfile.regenerate.cancel'), style: 'cancel' },
        {
          text: t('profile.publicProfile.regenerate.confirm'),
          style: 'destructive',
          onPress: () => submit({ enabled: true, regenerate: true }),
        },
      ],
    )
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top']}>
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('profile.publicProfile.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SettingsRow
          label={t('profile.publicProfile.enable.title')}
          desc={enabled ? t('profile.publicProfile.disabledHint') : t('profile.publicProfile.enable.description')}
          accessory="none"
          divider={false}
        >
          <Switch
            on={enabled}
            onToggle={() => submit({ enabled: !enabled })}
            accessibilityLabel={t('profile.publicProfile.enable.title')}
            disabled={mutation.isPending}
          />
        </SettingsRow>

        {enabled && shareUrl ? (
          <View>
            <SectionLabel>{t('profile.publicProfile.link.label')}</SectionLabel>
            <View style={styles.linkWell}>
              <Text style={styles.linkText} numberOfLines={1}>
                {shareUrl}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.copyChip,
                  { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
                ]}
                onPress={copyLink}
                accessibilityRole="button"
                accessibilityLabel={t('profile.publicProfile.link.copy')}
              >
                {copied ? (
                  <Check size={14} color={tokens.statusDone} strokeWidth={1.8} />
                ) : (
                  <Copy size={14} color={tokens.fg2} strokeWidth={1.8} />
                )}
                <Text style={styles.copyChipText}>
                  {copied ? t('profile.publicProfile.link.copied') : t('profile.publicProfile.link.copy')}
                </Text>
              </Pressable>
            </View>
            <View style={styles.shareBlock}>
              <PillButton
                fullWidth
                onPress={shareLink}
                leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
              >
                {t('profile.publicProfile.link.share')}
              </PillButton>
            </View>
          </View>
        ) : null}

        <SectionLabel>{t('profile.publicProfile.visibilityTitle')}</SectionLabel>
        {VISIBILITY_FIELDS.map(({ field, i18nKey }) => (
          <SettingsRow
            key={field}
            label={t(`profile.publicProfile.fields.${i18nKey}.title`)}
            desc={t(`profile.publicProfile.fields.${i18nKey}.description`)}
            accessory="none"
          >
            <Switch
              on={settings?.[field] ?? false}
              onToggle={() => submit({ [field]: !(settings?.[field] ?? false) })}
              accessibilityLabel={t(`profile.publicProfile.fields.${i18nKey}.title`)}
              disabled={!enabled || mutation.isPending}
            />
          </SettingsRow>
        ))}

        {enabled ? (
          <View style={styles.regenBlock}>
            <Pressable
              onPress={confirmRegenerate}
              disabled={mutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('profile.publicProfile.regenerate.button')}
              style={({ pressed }) => [styles.regenButton, { opacity: pressed || mutation.isPending ? 0.6 : 1 }]}
            >
              <RefreshCw size={16} color={tokens.primarySoft} strokeWidth={1.8} />
              <Text style={styles.regenText}>{t('profile.publicProfile.regenerate.button')}</Text>
            </Pressable>
            <Text style={styles.hint}>{t('profile.publicProfile.regenerate.hint')}</Text>
          </View>
        ) : null}

        <Text style={styles.privacyHint}>{t('profile.publicProfile.privacyHint')}</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 24,
    },
    linkWell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 4,
    },
    linkText: {
      flex: 1,
      fontFamily: 'Roboto_400Regular',
      fontSize: 15,
      color: tokens.fg1,
    },
    copyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 16,
      minHeight: 40,
    },
    copyChipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
    shareBlock: {
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    regenBlock: {
      paddingHorizontal: 20,
      paddingTop: 14,
      gap: 4,
    },
    regenButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
    },
    regenText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.primarySoft,
    },
    hint: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      lineHeight: 18,
      color: tokens.fg3,
    },
    privacyHint: {
      paddingHorizontal: 20,
      paddingTop: 14,
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      lineHeight: 18,
      color: tokens.fg3,
    },
  })
}
