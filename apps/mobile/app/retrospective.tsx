import { useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Lock, BarChart3 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'
import { useProfile, useHasProAccess, useIsYearlyPro } from '@/hooks/use-profile'
import { useRetrospective, type RetrospectivePeriod } from '@/hooks/use-retrospective'
import { apiClient } from '@/lib/api-client'
import { useAppTheme } from '@/lib/use-app-theme'

const PERIODS: RetrospectivePeriod[] = ['week', 'month', 'quarter', 'semester', 'year']

function RetrospectiveBody({
  text,
  styles,
}: Readonly<{ text: string; styles: ReturnType<typeof createStyles> }>) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)

  function renderInlineMarkdown(line: string) {
    const parts = line.split(/(\*\*.+?\*\*)/g).filter(Boolean)

    return parts.map((part, index) => {
      const strongMatch = /^\*\*(.+?)\*\*$/.exec(part)
      if (strongMatch) {
        return (
          <Text key={`${part}-${index}`} style={styles.resultStrong}>
            {strongMatch[1]}
          </Text>
        )
      }

      return (
        <Text key={`${part}-${index}`} style={styles.resultInline}>
          {part}
        </Text>
      )
    })
  }

  return (
    <View style={styles.resultContent}>
      {lines.map((line, index) => {
        const headingMatch = /^\*\*(.+?)\*\*$/.exec(line)
        if (headingMatch) {
          return (
            <Text key={`${line}-${index}`} style={styles.resultHeading}>
              {headingMatch[1]}
            </Text>
          )
        }

        return (
          <Text key={`${line}-${index}`} style={styles.resultParagraph}>
            {renderInlineMarkdown(line)}
          </Text>
        )
      })}
    </View>
  )
}

export default function RetrospectiveScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const hasProAccess = useHasProAccess()
  const isYearlyPro = useIsYearlyPro()
  const {
    retrospective,
    setRetrospective,
    isLoading,
    error,
    setError,
    fromCache,
    period,
    setPeriod,
    generate,
  } = useRetrospective()
  const [portalError, setPortalError] = useState('')

  function selectPeriod(nextPeriod: RetrospectivePeriod) {
    setPeriod(nextPeriod)
    setRetrospective(null)
    setError(null)
  }

  async function handleOpenPortal() {
    setPortalError('')
    try {
      const data = await apiClient<{ url?: string }>(API.subscription.portal, {
        method: 'POST',
      })
      if (data?.url) {
        await Linking.openURL(data.url)
      }
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    }
  }

  const isLoaded = !!profile

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
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{t('retrospective.title')}</Text>
            <View style={styles.yearlyBadge}>
              <Text style={styles.yearlyBadgeText}>{t('common.yearlyBadge')}</Text>
            </View>
          </View>
        </View>

        {isLoaded && !hasProAccess && (
          <View style={styles.lockedCard}>
            <View style={styles.lockedIconCircle}>
              <Lock size={32} color={colors.primary} />
            </View>
            <Text style={styles.lockedTitle}>{t('retrospective.locked')}</Text>
            <Text style={styles.lockedDescription}>{t('retrospective.lockedHint')}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/upgrade')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{t('upgrade.subscribe')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoaded && hasProAccess && !isYearlyPro && (
          <View style={styles.lockedCard}>
            <View style={styles.lockedIconCircle}>
              <Lock size={32} color={colors.primary} />
            </View>
            <Text style={styles.lockedTitle}>{t('retrospective.lockedYearly')}</Text>
            <Text style={styles.lockedDescription}>{t('retrospective.lockedYearlyHint')}</Text>
            {profile?.isTrialActive ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push('/upgrade')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>{t('upgrade.subscribe')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleOpenPortal}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>{t('retrospective.changePlan')}</Text>
              </TouchableOpacity>
            )}
            {portalError ? (
              <Text style={styles.portalError}>{portalError}</Text>
            ) : null}
          </View>
        )}

        {isLoaded && isYearlyPro && (
          <>
            <View style={styles.periodRow}>
              {PERIODS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.periodChip, period === item && styles.periodChipActive]}
                  onPress={() => selectPeriod(item)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.periodChipText,
                      period === item && styles.periodChipTextActive,
                    ]}
                  >
                    {t(`retrospective.periods.${item}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.generateButton, isLoading && styles.generateButtonDisabled]}
              onPress={generate}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : null}
              <Text style={styles.generateButtonText}>
                {isLoading ? t('retrospective.generating') : t('retrospective.generate')}
              </Text>
            </TouchableOpacity>

            {isLoading && (
              <View style={styles.resultCard}>
                <View style={[styles.skeletonBlock, { width: 140, height: 18 }]} />
                <View style={{ gap: 8 }}>
                  <View style={[styles.skeletonBlock, { width: '100%', height: 14 }]} />
                  <View style={[styles.skeletonBlock, { width: '86%', height: 14 }]} />
                  <View style={[styles.skeletonBlock, { width: '70%', height: 14 }]} />
                </View>
                <View style={[styles.skeletonBlock, { width: 180, height: 18 }]} />
                <View style={{ gap: 8 }}>
                  <View style={[styles.skeletonBlock, { width: '100%', height: 14 }]} />
                  <View style={[styles.skeletonBlock, { width: '78%', height: 14 }]} />
                </View>
              </View>
            )}

            {!isLoading && retrospective && (
              <View style={styles.resultCard}>
                <RetrospectiveBody text={retrospective} styles={styles} />
                {fromCache && (
                  <Text style={styles.cachedText}>{t('retrospective.cached')}</Text>
                )}
              </View>
            )}

            {!isLoading && error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>{t('retrospective.error')}</Text>
                <TouchableOpacity onPress={generate} activeOpacity={0.7}>
                  <Text style={styles.retryText}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isLoading && !retrospective && !error && (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <BarChart3 size={24} color={colors.primary} />
                </View>
                <Text style={styles.emptyText}>{t('retrospective.empty')}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
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
  backButton: { padding: 8, marginLeft: -8, borderRadius: 999 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  yearlyBadge: {
    backgroundColor: colors.primary_20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  yearlyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  lockedCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  lockedIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary_20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  lockedDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  portalError: {
    fontSize: 12,
    color: colors.red400,
    textAlign: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: '#fff',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 14,
    marginBottom: 24,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
  },
  resultContent: {
    gap: 8,
  },
  resultHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 8,
  },
  resultStrong: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resultInline: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  resultParagraph: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  cachedText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 14,
    color: colors.red400,
    textAlign: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary_10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  })
}
