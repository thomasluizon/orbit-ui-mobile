import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gift, Lock } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useTranslation } from 'react-i18next'
import type { NextRewardCarrotState } from '@orbit/shared/utils'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface NextRewardCarrotProps {
  carrot: NextRewardCarrotState | null
  onUpgrade: () => void
}

/** "Next reward" upgrade nudge shown to free-unlocked users: next free level plus a Pro teaser. */
export function NextRewardCarrot({ carrot, onUpgrade }: Readonly<NextRewardCarrotProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  if (!carrot) return null

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: tintFromPrimary(tokens, 0.08),
            borderColor: tintFromPrimary(tokens, 0.28),
          },
        ]}
      >
        <View style={styles.titleRow}>
          <Gift size={18} strokeWidth={1.9} color={tokens.primarySoft} />
          <Text style={[styles.title, { color: tokens.fg2 }]}>
            {t('gamification.carrot.title').toUpperCase()}
          </Text>
        </View>

        <Text style={[styles.toNextLevel, { color: tokens.fg1 }]}>
          {t('gamification.carrot.toNextLevel', {
            xp: carrot.xpToNextLevel,
            level: carrot.nextLevel,
          })}
        </Text>

        {carrot.showProTeaser ? (
          <View style={styles.teaserRow}>
            <View style={styles.teaserLead}>
              <Lock size={16} strokeWidth={1.9} color={tokens.primarySoft} />
              <View style={styles.teaserCopy}>
                <Text style={[styles.teaserTitle, { color: tokens.fg1 }]} numberOfLines={1}>
                  {t('gamification.carrot.proTeaser.title')}
                </Text>
                <Text style={[styles.teaserSub, { color: tokens.fg3 }]} numberOfLines={1}>
                  {t('gamification.carrot.proTeaser.achievements')}
                </Text>
              </View>
            </View>
            <PillButton
              variant="primary"
              size="sm"
              onPress={onUpgrade}
              accessibilityLabel={t('common.upgrade')}
            >
              {t('common.upgrade')}
            </PillButton>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    letterSpacing: 0.96,
  },
  toNextLevel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    lineHeight: 22,
  },
  teaserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  teaserLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  teaserCopy: {
    flexShrink: 1,
    minWidth: 0,
  },
  teaserTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  teaserSub: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
})
