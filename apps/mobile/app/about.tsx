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
  BookOpen,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  Gift,
} from 'lucide-react-native'
import { colors } from '@/lib/theme'

// ---------------------------------------------------------------------------
// NavRow component
// ---------------------------------------------------------------------------

function NavRow({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={styles.navCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.navCardIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.navCardTitle}>{title}</Text>
        <Text style={styles.navCardHint}>{hint}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// About Screen
// ---------------------------------------------------------------------------

export default function AboutScreen() {
  const { t } = useTranslation()
  const router = useRouter()

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
          <Text style={styles.headerTitle}>{t('about.title')}</Text>
        </View>

        {/* Feature Guide */}
        <NavRow
          icon={<BookOpen size={20} color={colors.primary} />}
          title={t('onboarding.featureGuide.title')}
          hint={t('profile.featureGuideHint')}
          onPress={() => {
            // Feature guide -- could navigate or open a bottom sheet
          }}
        />

        {/* Referral */}
        <NavRow
          icon={<Gift size={20} color={colors.primary} />}
          title={t('referral.card.title')}
          hint={t('referral.card.hint')}
          onPress={() => {
            // Referral flow
          }}
        />

        {/* Support */}
        <NavRow
          icon={<MessageSquare size={20} color={colors.primary} />}
          title={t('profile.support.title')}
          hint={t('profile.support.hint')}
          onPress={() => router.push('/support')}
        />

        {/* Privacy Policy */}
        <NavRow
          icon={<ShieldCheck size={20} color={colors.primary} />}
          title={t('privacy.title')}
          hint={t('privacy.hint')}
          onPress={() => router.push('/privacy')}
        />
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
    paddingTop: 32,
    paddingBottom: 24,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },

  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    marginBottom: 8,
    gap: 16,
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(139,92,246,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  navCardHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
})
