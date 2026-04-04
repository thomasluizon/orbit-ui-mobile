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
  BookOpen,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react-native'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
}

// ---------------------------------------------------------------------------
// About Screen
// ---------------------------------------------------------------------------

export default function AboutScreen() {
  const router = useRouter()

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
          <Text style={styles.headerTitle}>About & Help</Text>
        </View>

        {/* Feature Guide */}
        <NavRow
          icon={<BookOpen size={20} color={colors.primary} />}
          title="Feature Guide"
          hint="Learn how to get the most out of Orbit"
          onPress={() => {
            // Would navigate to onboarding/feature guide
          }}
        />

        {/* Support */}
        <NavRow
          icon={<MessageCircle size={20} color={colors.primary} />}
          title="Support"
          hint="Get help or send feedback"
          onPress={() => router.push('/support')}
        />

        {/* Privacy Policy */}
        <NavRow
          icon={<ShieldCheck size={20} color={colors.primary} />}
          title="Privacy Policy"
          hint="How we handle your data"
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
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 8,
    gap: 16,
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${colors.primary}15`,
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
