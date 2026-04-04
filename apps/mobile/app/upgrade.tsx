import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
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
import { useProfile, useHasProAccess, useTrialExpired, useTrialDaysLeft } from '@/hooks/use-profile'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
}

const PRO_FEATURES = [
  { icon: Sparkles, label: 'Unlimited habits', free: '5 habits' },
  { icon: MessageSquare, label: 'Unlimited AI chat', free: '10/month' },
  { icon: Palette, label: 'All color schemes', free: '1 scheme' },
  { icon: BarChart3, label: 'AI daily summary', free: 'N/A' },
  { icon: Flame, label: 'AI retrospective', free: 'N/A' },
]

// ---------------------------------------------------------------------------
// Upgrade Screen
// ---------------------------------------------------------------------------

export default function UpgradeScreen() {
  const router = useRouter()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()

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
          <Text style={styles.headerTitle}>Subscription</Text>
        </View>

        {/* Current status */}
        {hasProAccess && (
          <View style={styles.proCard}>
            <BadgeCheck size={32} color={colors.primary} />
            <Text style={styles.proTitle}>Orbit Pro</Text>
            <Text style={styles.proSubtitle}>
              You have full access to all Pro features.
            </Text>
          </View>
        )}

        {/* Trial banner */}
        {profile?.isTrialActive && trialDaysLeft !== null && (
          <View style={styles.trialBanner}>
            <Text style={styles.trialBannerText}>
              {trialDaysLeft <= 1
                ? 'Last day of your Pro trial!'
                : `${trialDaysLeft} days left in your Pro trial`}
            </Text>
          </View>
        )}

        {/* Trial expired */}
        {trialExpired && (
          <View style={styles.expiredCard}>
            <Text style={styles.expiredTitle}>Your trial has ended</Text>
            <Text style={styles.expiredSubtitle}>
              Don't lose access to:
            </Text>
            {['Unlimited habits', 'Unlimited AI chat', 'All color schemes', 'AI daily summary', 'AI retrospective'].map(
              (item) => (
                <View key={item} style={styles.expiredRow}>
                  <XIcon size={14} color={colors.red} />
                  <Text style={styles.expiredItemText}>{item}</Text>
                </View>
              ),
            )}
          </View>
        )}

        {/* Feature comparison */}
        <Text style={styles.sectionLabel}>Features</Text>
        <View style={styles.featureCard}>
          {PRO_FEATURES.map((feat) => {
            const Icon = feat.icon
            return (
              <View key={feat.label} style={styles.featureRow}>
                <Icon size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>{feat.label}</Text>
                </View>
                <View style={styles.featureBadges}>
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>{feat.free}</Text>
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
            <Text style={styles.sectionLabel}>Choose a Plan</Text>

            {/* Monthly */}
            <TouchableOpacity style={styles.planCard} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>Pro Monthly</Text>
                <Text style={styles.planPrice}>
                  $4.99<Text style={styles.planPeriod}>/mo</Text>
                </Text>
              </View>
              <Text style={styles.planCta}>Subscribe</Text>
            </TouchableOpacity>

            {/* Yearly */}
            <TouchableOpacity
              style={[styles.planCard, styles.planCardRecommended]}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.recommendedRow}>
                  <Text style={styles.planName}>Pro Yearly</Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>
                      Recommended
                    </Text>
                  </View>
                </View>
                <Text style={styles.planPrice}>
                  $39.99<Text style={styles.planPeriod}>/yr</Text>
                </Text>
                <Text style={styles.planSave}>Save ~33%</Text>
              </View>
              <Text style={styles.planCta}>Subscribe</Text>
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
