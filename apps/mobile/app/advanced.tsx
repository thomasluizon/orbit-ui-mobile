import { useState, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Plus,
  Lock,
  Smartphone,
  Clock,
  List,
  RotateCcw,
  Clipboard as ClipboardIcon,
  Check,
  X,
} from 'lucide-react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { API } from '@orbit/shared/api'
import { getTimezoneList } from '@orbit/shared/utils'
import { apiKeyKeys } from '@orbit/shared/query'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// API Keys types
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAtUtc: string
  lastUsedAtUtc: string | null
}

interface ApiKeyCreateResponse {
  id: string
  key: string
  name: string
}

// ---------------------------------------------------------------------------
// Advanced Screen
// ---------------------------------------------------------------------------

export default function AdvancedScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS

  // --- Timezone ---
  const [timezoneList, setTimezoneList] = useState<string[]>([])
  const [timezoneSearch, setTimezoneSearch] = useState('')
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  const [timezoneSaved, setTimezoneSaved] = useState(false)

  useEffect(() => {
    setTimezoneList(getTimezoneList())
  }, [])

  const filteredTimezones = useMemo(() => {
    const search = timezoneSearch.toLowerCase()
    if (!search) return timezoneList.slice(0, 50)
    return timezoneList.filter((tz) => tz.toLowerCase().includes(search)).slice(0, 100)
  }, [timezoneSearch, timezoneList])

  async function handleTimezoneChange(newTimezone: string) {
    setTimezoneSaving(true)
    setTimezoneSaved(false)
    try {
      await apiClient(API.profile.timezone, {
        method: 'PUT',
        body: JSON.stringify({ timeZone: newTimezone }),
      })
      patchProfile({ timeZone: newTimezone })
    } catch {
      // Silently fail
    }
    setTimeout(() => {
      setTimezoneSaving(false)
      setTimezoneSaved(true)
      setTimezoneOpen(false)
      setTimezoneSearch('')
    }, 400)
  }

  // --- Widget Info ---
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  // --- API Keys ---
  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: () => apiClient<ApiKey[]>(API.apiKeys.list),
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const MAX_API_KEYS = 5
  const canCreateKey = apiKeys.length < MAX_API_KEYS

  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false)
  const [createKeyError, setCreateKeyError] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => apiClient(API.apiKeys.delete(id), { method: 'DELETE' }),
    onSuccess: () => {
      setRevokingKeyId(null)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })

  // --- Connection Instructions ---
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState<'web' | 'desktop' | 'code'>('web')
  const [configCopied, setConfigCopied] = useState(false)
  const [endpointCopied, setEndpointCopied] = useState(false)

  const mcpConfigJson = `{
  "mcpServers": {
    "orbit": {
      "url": "https://api.useorbit.org/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: dateFnsLocale })
  }

  async function handleCreateKey(name: string): Promise<ApiKeyCreateResponse | null> {
    setCreateKeyError(null)
    try {
      const result = await apiClient<ApiKeyCreateResponse>(API.apiKeys.create, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      await queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result
    } catch (err: unknown) {
      setCreateKeyError(err instanceof Error ? err.message : t('apiKeys.errors.create'))
      return null
    }
  }

  async function copyEndpoint() {
    await Clipboard.setStringAsync('https://api.useorbit.org/mcp')
    setEndpointCopied(true)
    setTimeout(() => setEndpointCopied(false), 2000)
  }

  async function copyConfig() {
    await Clipboard.setStringAsync(mcpConfigJson)
    setConfigCopied(true)
    setTimeout(() => setConfigCopied(false), 2000)
  }

  // Widget steps and features
  const widgetSteps = [
    { num: '1', text: t('profile.widgetHow.step1') },
    { num: '2', text: t('profile.widgetHow.step2') },
    { num: '3', text: t('profile.widgetHow.step3') },
  ]

  const widgetFeatures = [
    { icon: <CheckCircle size={16} color={colors.primary} />, text: t('profile.widgetHow.feature1') },
    { icon: <Clock size={16} color={colors.primary} />, text: t('profile.widgetHow.feature2') },
    { icon: <List size={16} color={colors.primary} />, text: t('profile.widgetHow.feature3') },
    { icon: <RotateCcw size={16} color={colors.primary} />, text: t('profile.widgetHow.feature4') },
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
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('advancedSettings.title')}</Text>
        </View>

        {/* Timezone */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('profile.timezone.title')}</Text>
          <View style={styles.timezoneRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.timezoneValue}>{t('profile.timezone.current')} </Text>
              <Text style={styles.timezoneHighlight}>
                {profile?.timeZone || t('profile.timezone.notSet')}
              </Text>
              {timezoneSaving && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
              {!timezoneSaving && timezoneSaved && (
                <CheckCircle size={14} color={colors.green} />
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                setTimezoneOpen(!timezoneOpen)
                setTimezoneSaved(false)
              }}
            >
              <Text style={styles.editLink}>
                {timezoneOpen ? t('common.close') : t('common.edit')}
              </Text>
            </TouchableOpacity>
          </View>

          {timezoneOpen && (
            <>
              <TextInput
                style={styles.searchInput}
                value={timezoneSearch}
                onChangeText={setTimezoneSearch}
                placeholder={t('profile.timezone.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <ScrollView style={styles.timezoneList} nestedScrollEnabled>
                {filteredTimezones.map((tz) => (
                  <TouchableOpacity
                    key={tz}
                    style={[
                      styles.timezoneItem,
                      tz === profile?.timeZone && styles.timezoneItemActive,
                    ]}
                    onPress={() => handleTimezoneChange(tz)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.timezoneItemText,
                        tz === profile?.timeZone && styles.timezoneItemTextActive,
                      ]}
                    >
                      {tz}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={styles.hintText}>
            {t('profile.timezone.description')}
          </Text>
        </View>

        {/* Widget tip */}
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => setShowWidgetInfo(true)}
          activeOpacity={0.7}
        >
          <View style={styles.navCardIcon}>
            <Smartphone size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.navCardTitle}>{t('profile.widgetTitle')}</Text>
            <Text style={styles.navCardHint}>{t('profile.widgetHint')}</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* For Developers */}
        <View style={styles.card}>
          <View style={styles.developerHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>{t('orbitMcp.title')}</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>{t('common.proBadge')}</Text>
              </View>
            </View>
            {!profile?.hasProAccess && (
              <TouchableOpacity
                onPress={() => router.push('/upgrade')}
                style={styles.lockRow}
              >
                <Lock size={14} color={colors.primary} />
                <Text style={styles.lockText}>{t('common.proBadge')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.cardDescription}>
            {t('orbitMcp.description')}
          </Text>

          {profile?.hasProAccess && (
            <>
              {/* API Keys Sub-section */}
              <View style={{ gap: 10, marginTop: 4 }}>
                <View style={styles.apiKeysHeaderRow}>
                  <Text style={styles.subLabel}>{t('orbitMcp.apiKeys')}</Text>
                  {canCreateKey && (
                    <TouchableOpacity
                      style={styles.createKeyButton}
                      onPress={() => setCreateKeyModalOpen(true)}
                    >
                      <Plus size={14} color={colors.primary} />
                      <Text style={styles.createKeyText}>{t('orbitMcp.createKey')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.hintText}>
                  {t('orbitMcp.apiKeysDescription')}
                </Text>

                {!canCreateKey && (
                  <Text style={styles.warningText}>
                    {t('orbitMcp.maxKeysReached')}
                  </Text>
                )}

                {/* Loading */}
                {apiKeysQuery.isLoading && (
                  <View style={{ gap: 8 }}>
                    <View style={[styles.skeletonBar, { height: 56 }]} />
                    <View style={[styles.skeletonBar, { height: 56 }]} />
                  </View>
                )}

                {/* Error */}
                {apiKeysQuery.error && !apiKeysQuery.isLoading && (
                  <Text style={styles.errorText}>{t('orbitMcp.apiKeysError')}</Text>
                )}

                {/* Empty */}
                {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 && (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <Text style={styles.emptyText}>{t('orbitMcp.noKeys')}</Text>
                  </View>
                )}

                {/* Key list */}
                {apiKeys.length > 0 && (
                  <View style={{ gap: 8 }}>
                    {apiKeys.map((key) => (
                      <View key={key.id} style={styles.apiKeyCard}>
                        <View style={styles.apiKeyRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.apiKeyName}>{key.name}</Text>
                            <Text style={styles.apiKeyPrefix}>{key.keyPrefix}...</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.apiKeyDate}>{t('orbitMcp.created')} {formatKeyDate(key.createdAtUtc)}</Text>
                            <Text style={styles.apiKeyDate}>
                              {t('orbitMcp.lastUsed')} {key.lastUsedAtUtc ? formatKeyDate(key.lastUsedAtUtc) : t('orbitMcp.never')}
                            </Text>
                          </View>
                        </View>

                        {revokingKeyId !== key.id ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <TouchableOpacity onPress={() => setRevokingKeyId(key.id)}>
                              <Text style={styles.revokeText}>{t('orbitMcp.revoke')}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.revokeConfirmBar}>
                            <Text style={styles.revokeConfirmText}>{t('orbitMcp.revokeConfirm')}</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity onPress={() => setRevokingKeyId(null)}>
                                <Text style={styles.revokeCancelText}>{t('orbitMcp.cancel')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => revokeKeyMutation.mutate(key.id)}>
                                <Text style={styles.revokeConfirmAction}>{t('orbitMcp.confirm')}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Connection Instructions */}
              <View style={styles.instructionsDivider}>
                <TouchableOpacity
                  style={styles.instructionsToggle}
                  onPress={() => setInstructionsOpen(!instructionsOpen)}
                >
                  <Text style={styles.subLabel}>{t('orbitMcp.connectionInstructions')}</Text>
                  <ChevronDown
                    size={16}
                    color={colors.textMuted}
                    style={instructionsOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
                  />
                </TouchableOpacity>

                {instructionsOpen && (
                  <View style={{ gap: 12, marginTop: 12 }}>
                    {/* Tab buttons */}
                    <View style={styles.tabRow}>
                      {(['web', 'desktop', 'code'] as const).map((tab) => (
                        <TouchableOpacity
                          key={tab}
                          style={[
                            styles.tabButton,
                            activeConfigTab === tab && styles.tabButtonActive,
                          ]}
                          onPress={() => setActiveConfigTab(tab)}
                        >
                          <Text
                            style={[
                              styles.tabButtonText,
                              activeConfigTab === tab && styles.tabButtonTextActive,
                            ]}
                          >
                            {tab === 'web' ? t('orbitMcp.claudeWeb') : tab === 'desktop' ? t('orbitMcp.claudeDesktop') : t('orbitMcp.claudeCode')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {activeConfigTab === 'web' ? (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.hintText}>
                          {t('orbitMcp.webInstructions')}
                        </Text>
                        <View style={styles.codeBlock}>
                          <Text style={styles.codeText}>https://api.useorbit.org/mcp</Text>
                          <TouchableOpacity
                            style={styles.codeCopyButton}
                            onPress={copyEndpoint}
                            activeOpacity={0.8}
                          >
                            {endpointCopied ? (
                              <Check size={16} color={colors.emerald400} />
                            ) : (
                              <ClipboardIcon size={16} color={colors.textSecondary} />
                            )}
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.hintText, { fontStyle: 'italic' }]}>
                          {t('orbitMcp.webNoApiKey')}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.hintText}>
                          {t('orbitMcp.configInstructions')}
                        </Text>
                        <View style={styles.codeBlock}>
                          <Text style={styles.codeText}>{mcpConfigJson}</Text>
                          <TouchableOpacity
                            style={styles.codeCopyButton}
                            onPress={copyConfig}
                            activeOpacity={0.8}
                          >
                            {configCopied ? (
                              <Check size={16} color={colors.emerald400} />
                            ) : (
                              <ClipboardIcon size={16} color={colors.textSecondary} />
                            )}
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.hintText, { fontStyle: 'italic' }]}>
                          {t('orbitMcp.replaceKey')}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Widget Info Modal */}
      <Modal
        visible={showWidgetInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWidgetInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.widgetTitle')}</Text>
              <TouchableOpacity onPress={() => setShowWidgetInfo(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 20 }}>
              <View style={{ gap: 8 }}>
                <Text style={styles.widgetSectionTitle}>{t('profile.widgetHow.title')}</Text>
                {widgetSteps.map((step) => (
                  <View key={step.num} style={styles.widgetStep}>
                    <Text style={styles.widgetStepNumber}>{step.num}</Text>
                    <Text style={styles.widgetStepText}>{step.text}</Text>
                  </View>
                ))}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.widgetSectionTitle}>{t('profile.widgetHow.featuresTitle')}</Text>
                {widgetFeatures.map((feature) => (
                  <View key={feature.text} style={styles.widgetFeatureRow}>
                    {feature.icon}
                    <Text style={styles.widgetFeatureText}>{feature.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <CreateApiKeyModal
        open={createKeyModalOpen}
        onOpenChange={setCreateKeyModalOpen}
        onCreateKey={handleCreateKey}
        apiError={createKeyError}
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    marginBottom: 12,
    gap: 10,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  hintText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },

  // Pro badge
  proBadge: {
    backgroundColor: 'rgba(139,92,246,0.20)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  developerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Timezone
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timezoneValue: { fontSize: 14, color: colors.textSecondary },
  timezoneHighlight: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  editLink: { fontSize: 12, fontWeight: '600', color: colors.primary },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timezoneList: {
    maxHeight: 200,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timezoneItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timezoneItemActive: {
    backgroundColor: 'rgba(139,92,246,0.20)',
  },
  timezoneItemText: { fontSize: 14, color: colors.textSecondary },
  timezoneItemTextActive: { color: colors.primary, fontWeight: '500' },

  // Nav card (widget)
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    marginBottom: 12,
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
  navCardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  navCardHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // API Keys
  apiKeysHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  createKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  createKeyText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  warningText: { fontSize: 12, fontWeight: '500', color: colors.amber },
  errorText: { fontSize: 12, color: colors.red },
  emptyText: { fontSize: 14, color: colors.textMuted },
  skeletonBar: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    width: '100%',
  },

  apiKeyCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  apiKeyName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  apiKeyPrefix: { fontSize: 12, color: colors.textMuted, fontFamily: 'monospace', marginTop: 2 },
  apiKeyDate: { fontSize: 10, color: colors.textMuted },
  revokeText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  revokeConfirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239,68,68,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  revokeConfirmText: { fontSize: 12, color: colors.red },
  revokeCancelText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  revokeConfirmAction: { fontSize: 12, fontWeight: '600', color: colors.red },

  // Instructions
  instructionsDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    marginTop: 4,
  },
  instructionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabButtonText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  tabButtonTextActive: { color: '#fff' },
  codeBlock: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    paddingRight: 48,
  },
  codeText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    lineHeight: 20,
  },
  codeCopyButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  // Widget info modal
  widgetSectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  widgetStep: { flexDirection: 'row', gap: 8 },
  widgetStepNumber: { fontSize: 14, fontWeight: '700', color: colors.primary },
  widgetStepText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  widgetFeatureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  widgetFeatureText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  })
}
