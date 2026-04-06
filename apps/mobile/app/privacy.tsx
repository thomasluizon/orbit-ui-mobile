import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppColors = ReturnType<typeof createColors>

export default function PrivacyScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const dataCollectedKeys = ['account', 'habits', 'chat', 'preferences'] as const
  const howWeUseKeys = ['provide', 'personalize', 'notifications'] as const
  const thirdPartyKeys = ['google', 'stripe', 'firebase', 'openai', 'resend'] as const

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('privacy.title')}</Text>
        </View>

        <Text style={styles.lastUpdated}>{t('privacy.lastUpdated')}</Text>

        <View style={styles.card}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.intro.title')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.intro.body')}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.dataCollected.title')}</Text>
            {dataCollectedKeys.map((key) => (
              <Text key={key} style={styles.listItem}>
                • {t(`privacy.dataCollected.${key}`)}
              </Text>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.howWeUse.title')}</Text>
            {howWeUseKeys.map((key) => (
              <Text key={key} style={styles.listItem}>
                • {t(`privacy.howWeUse.${key}`)}
              </Text>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.thirdParty.title')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.thirdParty.intro')}</Text>
            {thirdPartyKeys.map((key) => (
              <Text key={key} style={styles.listItem}>
                • {t(`privacy.thirdParty.${key}`)}
              </Text>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.noSell.title')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.noSell.body')}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.security.title')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.security.body')}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.deletion.title')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.deletion.body')}</Text>
            <Text style={styles.stepText}>{t('privacy.deletion.step1')}</Text>
            <Text style={styles.stepText}>{t('privacy.deletion.step2')}</Text>
            <Text style={styles.stepText}>{t('privacy.deletion.step3')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.deletion.step4')}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('privacy.contact.title')}</Text>
            <Text style={styles.sectionBody}>{t('privacy.contact.body')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
    lastUpdated: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
      gap: 16,
    },
    section: {
      gap: 6,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sectionBody: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    listItem: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    stepText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },
  })
}
