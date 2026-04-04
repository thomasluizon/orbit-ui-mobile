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

  const PRIVACY_URL = 'https://useorbit.org/privacy'

  const sections = [
    {
      title: 'Data Collection',
      content:
        'Orbit collects only the data necessary to provide our service: your email, habit data, and optional AI conversation history. We never sell your data.',
    },
    {
      title: 'Data Storage',
      content:
        'Your data is stored securely on encrypted servers. Habit logs, goals, and profile data are associated with your account and accessible only by you.',
    },
    {
      title: 'AI & Privacy',
      content:
        'When AI features are enabled, your habit data is processed to generate summaries and insights. This data is never used to train AI models or shared with third parties.',
    },
    {
      title: 'Third Parties',
      content:
        'We use essential third-party services for authentication (Google OAuth), payments (Stripe), and infrastructure. These services only receive the minimum data required.',
    },
    {
      title: 'Data Deletion',
      content:
        'You can delete your account at any time from Profile > Account Actions. Your data will be permanently deleted within 30 days. You can also use "Fresh Start" to wipe your data while keeping your account.',
    },
    {
      title: 'Your Rights',
      content:
        'You have the right to access, export, and delete your data. Contact support@useorbit.org for any data-related requests.',
    },
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
          <Text style={styles.headerTitle}>Privacy Policy</Text>
        </View>

        {/* Shield badge */}
        <View style={styles.shieldCard}>
          <ShieldCheck size={32} color={colors.green} />
          <Text style={styles.shieldTitle}>Your privacy matters</Text>
          <Text style={styles.shieldSubtitle}>
            Orbit is designed with privacy first. We collect minimal data and
            never sell it.
          </Text>
        </View>

        {/* Sections */}
        {sections.map((section) => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
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
            Read Full Privacy Policy
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
