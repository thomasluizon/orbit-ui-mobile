import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
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
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { API } from '@orbit/shared/api'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
  type WidgetFeatureIconKey,
} from '@orbit/shared/utils/advanced-settings'
import type {
  AgentCapability,
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from '@orbit/shared/types'
import { apiKeyKeys } from '@orbit/shared/query'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useOffline } from '@/hooks/use-offline'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { spacing } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProBadge } from '@/components/ui/pro-badge'

// ---------------------------------------------------------------------------
// Advanced Screen
// ---------------------------------------------------------------------------

export default function AdvancedScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const queryClient = useQueryClient()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const { isOnline } = useOffline()

  // --- Widget Info ---
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  // --- API Keys ---
  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: () => apiClient<ApiKey[]>(API.apiKeys.list),
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const capabilitiesQuery = useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => apiClient<AgentCapability[]>(API.ai.capabilities),
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const scopeOptions = useMemo(() => {
    const grouped = new Map<string, string[]>()

    for (const capability of capabilitiesQuery.data ?? []) {
      const descriptions = grouped.get(capability.scope) ?? []
      descriptions.push(capability.displayName)
      grouped.set(capability.scope, descriptions)
    }

    return Array.from(grouped.entries())
      .map(([scope, labels]) => ({
        scope,
        label: scope,
        description: labels.join(', '),
      }))
      .sort((left, right) => left.scope.localeCompare(right.scope))
  }, [capabilitiesQuery.data])
  const MAX_API_KEYS = 5
  const canCreateKey = apiKeys.length < MAX_API_KEYS

  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false)
  const [createKeyError, setCreateKeyError] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) =>
      performQueuedApiMutation({
        type: 'deleteApiKey',
        scope: 'apiKeys',
        endpoint: API.apiKeys.delete(id),
        method: 'DELETE',
        payload: undefined,
        targetEntityId: id,
        dedupeKey: `api-key-delete-${id}`,
      }),
    onMutate: async (id) => {
      setRevokingKeyId(id)
      await queryClient.cancelQueries({ queryKey: apiKeyKeys.all })
      const previous = queryClient.getQueryData<ApiKey[]>(apiKeyKeys.lists())
      queryClient.setQueryData<ApiKey[]>(apiKeyKeys.lists(), (old) =>
        old ? old.filter((key) => key.id !== id) : old,
      )
      return { previous }
    },
    onError: (_err, _id, context: { previous?: ApiKey[] } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(apiKeyKeys.lists(), context.previous)
      }
      setRevokingKeyId(null)
    },
    onSuccess: () => {
      setRevokingKeyId(null)
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      }
    },
  })

  // --- Connection Instructions ---
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [activeConfigTab, setActiveConfigTab] =
    useState<(typeof MCP_CONFIG_TABS)[number]>('web')
  const [configCopied, setConfigCopied] = useState(false)
  const [endpointCopied, setEndpointCopied] = useState(false)

  const mcpConfigJson = buildMcpConfigJson()

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: dateFnsLocale,
    })
  }

  async function handleCreateKey(
    request: ApiKeyCreateRequest,
  ): Promise<ApiKeyCreateResponse | null> {
    setCreateKeyError(null)
    if (!isOnline) {
      setCreateKeyError(t('calendarSync.notConnected'))
      return null
    }
    try {
      const result = await apiClient<ApiKeyCreateResponse>(API.apiKeys.create, {
        method: 'POST',
        body: JSON.stringify(request),
      })
      await queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result
    } catch (err: unknown) {
      setCreateKeyError(
        err instanceof Error ? err.message : t('apiKeys.errors.create'),
      )
      return null
    }
  }

  async function copyEndpoint() {
    await Clipboard.setStringAsync(MCP_ENDPOINT_URL)
    setEndpointCopied(true)
    setTimeout(() => setEndpointCopied(false), 2000)
  }

  async function copyConfig() {
    await Clipboard.setStringAsync(mcpConfigJson)
    setConfigCopied(true)
    setTimeout(() => setConfigCopied(false), 2000)
  }

  // Widget steps and features
  const widgetFeatureIconMap = useMemo(
    () =>
      ({
        checkCircle: <CheckCircle size={16} color={colors.primary} />,
        clock: <Clock size={16} color={colors.primary} />,
        list: <List size={16} color={colors.primary} />,
        rotateCcw: <RotateCcw size={16} color={colors.primary} />,
      }) satisfies Record<WidgetFeatureIconKey, React.ReactNode>,
    [colors.primary],
  )

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
            onPress={() => goBackOrFallback('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('advancedSettings.title')}</Text>
        </View>

        {/* Widget tip */}
        <TouchableOpacity
          style={styles.navCard}
          onPress={() => setShowWidgetInfo(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('profile.widgetTitle')}
          accessibilityHint={t('profile.widgetHint')}
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
              <ProBadge alwaysVisible />
            </View>
            {!profile?.hasProAccess && (
              <TouchableOpacity
                onPress={() => router.push(buildUpgradeHref('/advanced'))}
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
                      <Text style={styles.createKeyText}>
                        {t('orbitMcp.createKey')}
                      </Text>
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
                  <Text style={styles.errorText}>
                    {t('orbitMcp.apiKeysError')}
                  </Text>
                )}

                {/* Empty */}
                {!apiKeysQuery.isLoading &&
                  !apiKeysQuery.error &&
                  apiKeys.length === 0 && (
                    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                      <Text style={styles.emptyText}>
                        {t('orbitMcp.noKeys')}
                      </Text>
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
                            <Text style={styles.apiKeyPrefix}>
                              {key.keyPrefix}...
                            </Text>
                            <Text style={styles.apiKeyMeta}>
                              {key.scopes.length > 0
                                ? key.scopes.join(', ')
                                : t('orbitMcp.noScopes')}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.apiKeyDate}>
                              {t('orbitMcp.created')}{' '}
                              {formatKeyDate(key.createdAtUtc)}
                            </Text>
                            <Text style={styles.apiKeyDate}>
                              {t('orbitMcp.lastUsed')}{' '}
                              {key.lastUsedAtUtc
                                ? formatKeyDate(key.lastUsedAtUtc)
                                : t('orbitMcp.never')}
                            </Text>
                            <Text style={styles.apiKeyDate}>
                              {key.isReadOnly
                                ? t('orbitMcp.permReadOnly')
                                : t('orbitMcp.permReadWrite')}
                            </Text>
                            {key.expiresAtUtc && (
                              <Text style={styles.apiKeyDate}>
                                {t('orbitMcp.expiresOn', {
                                  date: formatKeyDate(key.expiresAtUtc),
                                })}
                              </Text>
                            )}
                          </View>
                        </View>

                        {revokingKeyId !== key.id ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <TouchableOpacity
                              onPress={() => setRevokingKeyId(key.id)}
                            >
                              <Text style={styles.revokeText}>
                                {t('orbitMcp.revoke')}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.revokeConfirmBar}>
                            <Text style={styles.revokeConfirmText}>
                              {t('orbitMcp.revokeConfirm')}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                onPress={() => setRevokingKeyId(null)}
                              >
                                <Text style={styles.revokeCancelText}>
                                  {t('orbitMcp.cancel')}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => revokeKeyMutation.mutate(key.id)}
                              >
                                <Text style={styles.revokeConfirmAction}>
                                  {t('orbitMcp.confirm')}
                                </Text>
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
                  accessibilityRole="button"
                  accessibilityState={{ expanded: instructionsOpen }}
                >
                  <Text style={styles.subLabel}>
                    {t('orbitMcp.connectionInstructions')}
                  </Text>
                  <ChevronDown
                    size={16}
                    color={colors.textMuted}
                    style={
                      instructionsOpen
                        ? { transform: [{ rotate: '180deg' }] }
                        : undefined
                    }
                  />
                </TouchableOpacity>

                {instructionsOpen && (
                  <View style={{ gap: 12, marginTop: 12 }}>
                    {/* Tab buttons */}
                    <View style={styles.tabRow}>
                      {MCP_CONFIG_TABS.map((tab) => (
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
                              activeConfigTab === tab &&
                                styles.tabButtonTextActive,
                            ]}
                          >
                            {tab === 'web'
                              ? t('orbitMcp.claudeWeb')
                              : tab === 'desktop'
                                ? t('orbitMcp.claudeDesktop')
                                : t('orbitMcp.claudeCode')}
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
                          <Text style={styles.codeText}>
                            {MCP_ENDPOINT_URL}
                          </Text>
                          <TouchableOpacity
                            style={styles.codeCopyButton}
                            onPress={copyEndpoint}
                            activeOpacity={0.8}
                          >
                            {endpointCopied ? (
                              <Check size={16} color={colors.emerald400} />
                            ) : (
                              <ClipboardIcon
                                size={16}
                                color={colors.textSecondary}
                              />
                            )}
                          </TouchableOpacity>
                        </View>
                        <Text
                          style={[styles.hintText, { fontStyle: 'italic' }]}
                        >
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
                              <ClipboardIcon
                                size={16}
                                color={colors.textSecondary}
                              />
                            )}
                          </TouchableOpacity>
                        </View>
                        <Text
                          style={[styles.hintText, { fontStyle: 'italic' }]}
                        >
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
                <Text style={styles.widgetSectionTitle}>
                  {t('profile.widgetHow.title')}
                </Text>
                {WIDGET_STEP_KEYS.map((stepKey, index) => (
                  <View key={stepKey} style={styles.widgetStep}>
                    <Text style={styles.widgetStepNumber}>{index + 1}</Text>
                    <Text style={styles.widgetStepText}>{t(stepKey)}</Text>
                  </View>
                ))}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.widgetSectionTitle}>
                  {t('profile.widgetHow.featuresTitle')}
                </Text>
                {WIDGET_FEATURES.map((feature) => (
                  <View key={feature.textKey} style={styles.widgetFeatureRow}>
                    {widgetFeatureIconMap[feature.iconKey]}
                    <Text style={styles.widgetFeatureText}>
                      {t(feature.textKey)}
                    </Text>
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
        availableScopes={scopeOptions}
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
    scrollContent: {
      paddingHorizontal: spacing.pageX,
      paddingBottom: spacing.pageBottom,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.cardGap,
      paddingTop: spacing.sectionGap * 2,
      paddingBottom: spacing.cardGap * 2,
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
      padding: spacing.cardPadding,
      marginBottom: spacing.cardGap,
      gap: spacing.cardGap,
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

    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lockText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    developerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    // Nav card (widget)
    navCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: spacing.cardPadding,
      marginBottom: spacing.cardGap,
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
    apiKeyPrefix: {
      fontSize: 12,
      color: colors.textMuted,
      fontFamily: 'monospace',
      marginTop: 2,
    },
    apiKeyMeta: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
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
    revokeCancelText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
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
    tabButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
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
    widgetSectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    widgetStep: { flexDirection: 'row', gap: 8 },
    widgetStepNumber: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    widgetStepText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
    widgetFeatureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    widgetFeatureText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  })
}
