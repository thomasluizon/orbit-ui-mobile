import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, ChevronRight } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
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
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface OnboardingTemplatePacksProps {
  onCreated: () => void
  onCreateOwn: () => void
  onSkip: () => void
}

/**
 * Starter template-pack picker: choose a pack, toggle habits off, then bulk-create.
 * Secondary actions branch to manual create or skip.
 */
export function OnboardingTemplatePacks({
  onCreated,
  onCreateOwn,
  onSkip,
}: Readonly<OnboardingTemplatePacksProps>) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
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
      setIsCreating(false)
      showError(
        getFriendlyErrorMessage(error, translate, 'errors.createHabit', 'habit'),
      )
    }
  }, [selectedPack, enabledCount, isCreating, disabledKeys, translate, actions, onCreated, showError])

  if (!selectedPack) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('onboarding.flow.templatePacks.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.flow.templatePacks.subtitle')}</Text>

        <View style={styles.list}>
          {TEMPLATE_PACKS.map((pack) => (
            <Pressable
              key={pack.id}
              onPress={() => setSelectedPackId(pack.id)}
              style={({ pressed }) => [styles.packRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={t(templatePackNameKey(pack.id))}
            >
              <View style={[styles.packEmoji, { backgroundColor: tintFromPrimary(tokens, 0.15) }]}>
                <Text style={styles.packEmojiText}>{pack.emoji}</Text>
              </View>
              <View style={styles.packText}>
                <Text style={styles.packName}>{t(templatePackNameKey(pack.id))}</Text>
                <Text style={styles.packDesc}>{t(templatePackDescriptionKey(pack.id))}</Text>
              </View>
              <ChevronRight size={22} strokeWidth={1.8} color={tokens.fg4} />
            </Pressable>
          ))}
        </View>

        <View style={styles.secondaryActions}>
          <Pressable
            onPress={onCreateOwn}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.textButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.flow.templatePacks.createOwn')}
          >
            <Text style={styles.secondaryEmphasis}>
              {t('onboarding.flow.templatePacks.createOwn')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onSkip}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.textButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.flow.templatePacks.skip')}
          >
            <Text style={styles.secondaryText}>{t('onboarding.flow.templatePacks.skip')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('onboarding.flow.templatePacks.customizeTitle')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.flow.templatePacks.customizeSubtitle')}</Text>

      <View style={styles.habitList}>
        {selectedPack.habits.map((habit) => {
          const enabled = !disabledKeys.has(habit.key)
          return (
            <Pressable
              key={habit.key}
              onPress={() => toggleHabit(habit.key)}
              style={({ pressed }) => [
                styles.habitRow,
                { opacity: enabled ? 1 : 0.55 },
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: enabled }}
              accessibilityLabel={t(templatePackHabitTitleKey(selectedPack.id, habit.key))}
            >
              <Text style={styles.habitEmoji}>{habit.emoji}</Text>
              <Text style={styles.habitTitle}>
                {t(templatePackHabitTitleKey(selectedPack.id, habit.key))}
              </Text>
              <View style={[styles.check, enabled ? styles.checkOn : styles.checkOff]}>
                {enabled ? <Check size={14} strokeWidth={2.4} color={tokens.fgOnPrimary} /> : null}
              </View>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.ctaWrap}>
        <PillButton
          fullWidth
          disabled={enabledCount === 0 || isCreating}
          busy={isCreating}
          onPress={() => void handleAdd()}
          leading={
            isCreating ? <ActivityIndicator size="small" color={tokens.fgOnPrimary} /> : undefined
          }
        >
          {enabledCount === 1
            ? t('onboarding.flow.templatePacks.createCtaOne')
            : t('onboarding.flow.templatePacks.createCta', { count: enabledCount })}
        </PillButton>
        <Pressable
          onPress={() => setSelectedPackId(null)}
          style={styles.secondaryButton}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.flow.back')}
        >
          <Text style={styles.secondaryText}>{t('onboarding.flow.back')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      gap: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      letterSpacing: -0.24,
      lineHeight: 31,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
    },
    list: {
      gap: 10,
    },
    packRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgCard,
    },
    packEmoji: {
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    packEmojiText: {
      fontSize: 22,
    },
    packText: {
      flex: 1,
      gap: 3,
    },
    packName: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    packDesc: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 18,
      color: tokens.fg3,
    },
    habitList: {
      gap: 8,
    },
    habitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: tokens.bgCard,
    },
    habitEmoji: {
      fontSize: 20,
    },
    habitTitle: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: {
      backgroundColor: tokens.primary,
    },
    checkOff: {
      borderWidth: 2,
      borderColor: tokens.hairlineStrong,
    },
    ctaWrap: {
      marginTop: 8,
      gap: 4,
    },
    secondaryActions: {
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowPressed: {
      backgroundColor: tokens.bgElev2,
      transform: [{ scale: 0.99 }],
    },
    textButtonPressed: {
      transform: [{ scale: 0.96 }],
      opacity: 0.7,
    },
    secondaryEmphasis: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.primarySoft,
    },
    secondaryText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
