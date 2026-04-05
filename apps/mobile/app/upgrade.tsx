import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  BadgeCheck,
  Sparkles,
  Check,
  X as XIcon,
  Flame,
  MessageSquare,
  Palette,
  BarChart3,
} from 'lucide-react-native'
import { colors } from '@/lib/theme'
import { useProfile, useHasProAccess, useTrialExpired, useTrialDaysLeft } from '@/hooks/use-profile'

// ---------------------------------------------------------------------------
// Upgrade Screen
// ---------------------------------------------------------------------------

export default function UpgradeScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()

  const PRO_FEATURES = [
    { icon: Sparkles, labelKey: 'upgrade.features.habits.label', freeKey: 'upgrade.features.habits.free' },
    { icon: MessageSquare, labelKey: 'upgrade.features.ai.label', freeKey: 'upgrade.features.ai.free' },
    { icon: Palette, labelKey: 'upgrade.features.colors.label', freeKey: 'upgrade.features.colors.free' },
    { icon: BarChart3, labelKey: 'upgrade.features.summary.label', freeKey: 'upgrade.features.summary.free' },
    { icon: Flame, labelKey: 'upgrade.features.retrospective.label', freeKey: 'upgrade.features.retrospective.free' },
  ]

  const EXPIRED_FEATURES = [
    'upgrade.plans.proFeatures.unlimited',
    'upgrade.plans.proFeatures.ai',
    'upgrade.plans.proFeatures.themes',
    'upgrade.plans.proFeatures.retrospective',
    'upgrade.plans.proFeatures.allFeatures',
  ]

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('upgrade.title')}</Text>
        </View>

        {/* Current status */}
        {hasProAccess && (
          <View style={styles.proCard}>
            <BadgeCheck size={32} color={colors.primary} />
            <Text style={styles.proTitle}>{t('profile.subscription.pro')}</Text>
            <Text style={styles.proSubtitle}>
              {t('upgrade.alreadyPro')}
            </Text>
          </View>
        )}

        {/* Trial banner */}
        {profile?.isTrialActive && trialDaysLeft !== null && (
          <View style={styles.trialBanner}>
            <Text style={styles.trialBannerText}>
              {trialDaysLeft <= 1
                ? t('trial.banner.lastDay')
                : t('trial.banner.daysLeft', { days: trialDaysLeft })}
            </Text>
          </View>
        )}

        {/* Trial expired */}
        {trialExpired && (
          <View style={styles.expiredCard}>
            <Text style={styles.expiredTitle}>{t('trial.expired.title')}</Text>
            <Text style={styles.expiredSubtitle}>
              {t('trial.expired.dontLose')}
            </Text>
            {EXPIRED_FEATURES.map(
              (key) => (
                <View key={key} style={styles.expiredRow}>
                  <XIcon size={14} color={colors.red} />
                  <Text style={styles.expiredItemText}>{t(key)}</Text>
                </View>
              ),
            )}
          </View>
        )}

        {/* Feature comparison */}
        <Text style={styles.sectionLabel}>{t('profile.sections.features')}</Text>
        <View style={styles.featureCard}>
          {PRO_FEATURES.map((feat) => {
            const Icon = feat.icon
            return (
              <View key={feat.labelKey} style={styles.featureRow}>
                <Icon size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>{t(feat.labelKey)}</Text>
                </View>
                <View style={styles.featureBadges}>
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>{t(feat.freeKey)}</Text>
                  </View>
                  <View style={styles.proBadge}>
                    <Check size={12} color={colors.green} />
                  </View>
                </View>
              </View>
            )
          })}
        </View>

        {/* Plan cards */}
        {!hasProAccess && (
          <>
            <Text style={styles.sectionLabel}>{t('upgrade.subscribe')}</Text>

            {/* Monthly */}
            <TouchableOpacity style={styles.planCard} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{t('upgrade.plans.monthly.name')}</Text>
                <Text style={styles.planPrice}>
                  $4.99<Text style={styles.planPeriod}>{t('upgrade.plans.monthly.period')}</Text>
                </Text>
              </View>
              <Text style={styles.planCta}>{t('upgrade.plans.monthly.cta')}</Text>
            </TouchableOpacity>

            {/* Yearly */}
            <TouchableOpacity
              style={[styles.planCard, styles.planCardRecommended]}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.recommendedRow}>
                  <Text style={styles.planName}>{t('upgrade.plans.yearly.name')}</Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>
                      {t('upgrade.plans.yearly.recommended')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.planPrice}>
                  $39.99<Text style={styles.planPeriod}>{t('upgrade.plans.yearly.period')}</Text>
                </Text>
                <Text style={styles.planSave}>{t('upgrade.save33')}</Text>
              </View>
              <Text style={styles.planCta}>{t('upgrade.plans.yearly.cta')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  proCard: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  proTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  proSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  trialBanner: {
    backgroundColor: `${colors.amber}15`,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  trialBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.amber,
    textAlign: 'center',
  },
  expiredCard: {
    backgroundColor: `${colors.red}10`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.red}20`,
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  expiredTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.red,
  },
  expiredSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  expiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expiredItemText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 12,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  featureBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freeBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  freeBadgeText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  proBadge: {
    backgroundColor: `${colors.green}20`,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 8,
  },
  planCardRecommended: {
    borderColor: `${colors.primary}40`,
    backgroundColor: `${colors.primary}08`,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  planSave: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.green,
    marginTop: 2,
  },
  planCta: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  recommendedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recommendedBadge: {
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
})
