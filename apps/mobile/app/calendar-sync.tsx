import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CalendarDays,
  Link2,
  Unlink,
  RefreshCcw,
} from 'lucide-react-native'
import { colors } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Calendar Sync Screen
// ---------------------------------------------------------------------------

export default function CalendarSyncScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile, invalidate } = useProfile()

  const isConnected = profile?.hasGoogleConnection ?? false
  const hasImported = profile?.hasImportedCalendar ?? false

  async function handleConnect() {
    // In a real implementation this would trigger Google OAuth
    Alert.alert(
      t('calendar.title'),
      t('calendarSync.connectMessage'),
    )
  }

  async function handleDisconnect() {
    Alert.alert(
      t('calendarSync.disconnectConfirmTitle'),
      t('calendarSync.disconnectConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('calendarSync.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient('/api/calendar/dismiss', { method: 'POST' })
              invalidate()
            } catch {
              Alert.alert(t('calendarSync.error'), t('calendarSync.disconnectError'))
            }
          },
        },
      ],
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
          <Text style={styles.headerTitle}>{t('calendarSync.title')}</Text>
        </View>

        {/* Status card */}
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor: isConnected
                  ? `${colors.green}15`
                  : `${colors.textMuted}15`,
              },
            ]}
          >
            <CalendarDays
              size={24}
              color={isConnected ? colors.green : colors.textMuted}
            />
          </View>
          <Text style={styles.statusTitle}>
            {isConnected ? t('calendarSync.connected') : t('calendarSync.notConnected')}
          </Text>
          <Text style={styles.statusDescription}>
            {isConnected
              ? t('calendarSync.connectedDesc')
              : t('calendarSync.notConnectedDesc')}
          </Text>
        </View>

        {/* Action buttons */}
        {isConnected ? (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => invalidate()}
              activeOpacity={0.7}
            >
              <RefreshCcw size={16} color={colors.primary} />
              <Text style={styles.actionButtonText}>{t('calendarSync.refresh')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
              activeOpacity={0.7}
            >
              <Unlink size={16} color={colors.red} />
              <Text style={styles.disconnectButtonText}>
                {t('calendarSync.disconnect')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleConnect}
            activeOpacity={0.8}
          >
            <Link2 size={18} color="#fff" />
            <Text style={styles.connectButtonText}>
              {t('calendarSync.connect')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t('calendarSync.howItWorks')}</Text>
          <Text style={styles.infoText}>
            {'1. '}{t('calendarSync.step1')}{'\n'}
            {'2. '}{t('calendarSync.step2')}{'\n'}
            {'3. '}{t('calendarSync.step3')}{'\n'}
            {'4. '}{t('calendarSync.step4')}
          </Text>
        </View>
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
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.red}30`,
    paddingVertical: 16,
    marginBottom: 16,
  },
  disconnectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.red,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
})
