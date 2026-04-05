import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Linking,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

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
}

// ---------------------------------------------------------------------------
// Privacy Screen
// ---------------------------------------------------------------------------

export default function PrivacyScreen() {
  const router = useRouter()
  const { t } = useTranslation()

  const PRIVACY_URL = 'https://useorbit.org/privacy'

  const SECTION_KEYS = [
    'dataCollection',
    'dataStorage',
    'aiPrivacy',
    'thirdParties',
    'dataDeletion',
    'yourRights',
  ] as const

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
          <Text style={styles.headerTitle}>{t('privacy.title')}</Text>
        </View>

        {/* Shield badge */}
        <View style={styles.shieldCard}>
          <ShieldCheck size={32} color={colors.green} />
          <Text style={styles.shieldTitle}>{t('privacy.badge')}</Text>
          <Text style={styles.shieldSubtitle}>
            {t('privacy.badgeDescription')}
          </Text>
        </View>

        {/* Sections */}
        {SECTION_KEYS.map((key) => (
          <View key={key} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(`privacy.${key}.title`)}</Text>
            <Text style={styles.sectionContent}>{t(`privacy.${key}.content`)}</Text>
          </View>
        ))}

        {/* Full policy link */}
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => Linking.openURL(PRIVACY_URL)}
          activeOpacity={0.7}
        >
          <ExternalLink size={16} color={colors.primary} />
          <Text style={styles.linkButtonText}>
            {t('privacy.fullPolicy')}
          </Text>
        </TouchableOpacity>
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
  shieldCard: {
    backgroundColor: `${colors.green}08`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.green}20`,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  shieldTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  shieldSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionContent: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  linkButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
})
