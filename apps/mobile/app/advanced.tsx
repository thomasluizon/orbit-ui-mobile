import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import { Lock } from 'lucide-react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { API } from '@orbit/shared/api'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Chip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export default function AdvancedScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const queryClient = useQueryClient()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const { isOnline } = useOffline()

  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

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
    },
    onSettled: () => {
      setRevokingKeyId(null)
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      }
    },
  })

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

  const codeContent =
    activeConfigTab === 'web' ? MCP_ENDPOINT_URL : mcpConfigJson
  const codeCopied =
    activeConfigTab === 'web' ? endpointCopied : configCopied
  const onCopy = activeConfigTab === 'web' ? copyEndpoint : copyConfig

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('advancedSettings.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
        <SettingsRow
          label={t('profile.widgetTitle')}
          onPress={() => setShowWidgetInfo(true)}
          accessory="chevron"
        />

        <SectionLabel>{t('advancedSettings.developersSection')}</SectionLabel>

        {profile?.hasProAccess ? (
          <>
            {apiKeysQuery.isLoading ? (
              <View style={styles.skelStack}>
                <View
                  style={[styles.skelBar, { backgroundColor: tokens.bgSunk }]}
                />
                <View
                  style={[styles.skelBar, { backgroundColor: tokens.bgSunk }]}
                />
              </View>
            ) : null}

            {apiKeysQuery.error && !apiKeysQuery.isLoading ? (
              <View style={styles.errorBlock}>
                <Text style={[styles.italicText, { color: tokens.statusBad }]}>
                  {t('orbitMcp.apiKeysError')}
                </Text>
              </View>
            ) : null}

            {!apiKeysQuery.isLoading &&
            !apiKeysQuery.error &&
            apiKeys.length === 0 ? (
              <View
                style={[
                  styles.italicBlock,
                  { borderBottomColor: tokens.hairline },
                ]}
              >
                <Text style={[styles.italicText, { color: tokens.fg3 }]}>
                  {t('orbitMcp.noKeys')}
                </Text>
              </View>
            ) : null}

            {apiKeys.map((key) => {
              const lastUsed = key.lastUsedAtUtc
                ? `${t('orbitMcp.lastUsed')} ${formatKeyDate(key.lastUsedAtUtc)}`
                : t('orbitMcp.never')
              const perm = key.isReadOnly
                ? t('orbitMcp.permReadOnly')
                : t('orbitMcp.permReadWrite')
              const meta = `${perm} · ${lastUsed} · ${t('orbitMcp.created')} ${formatKeyDate(key.createdAtUtc)}`
              return (
                <View
                  key={key.id}
                  style={[
                    styles.keyBlock,
                    { borderBottomColor: tokens.hairline },
                  ]}
                >
                  <View style={styles.keyTopRow}>
                    <Text
                      style={[styles.keyName, { color: tokens.fg1 }]}
                      numberOfLines={1}
                    >
                      {key.name}
                    </Text>
                    <Pressable
                      onPress={() => setRevokingKeyId(key.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('orbitMcp.revoke')}
                      style={styles.linkPress}
                    >
                      <Text
                        style={[styles.revokeLink, { color: tokens.fg3 }]}
                      >
                        {t('orbitMcp.revoke')}
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={[styles.keyPrefix, { color: tokens.fg3 }]}
                  >
                    {`${key.keyPrefix}…`}
                  </Text>
                  <Text
                    style={[styles.keyMeta, { color: tokens.fg3 }]}
                    numberOfLines={2}
                  >
                    {meta}
                  </Text>
                </View>
              )
            })}

            {canCreateKey ? (
              <View style={styles.actionPad}>
                <Pressable
                  onPress={() => setCreateKeyModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('orbitMcp.createKey')}
                  style={styles.linkPress}
                >
                  <Text style={[styles.actionLink, { color: tokens.fg1 }]}>
                    {`+ ${t('orbitMcp.createKey')}`}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.italicBlock,
                  { borderBottomColor: tokens.hairline },
                ]}
              >
                <Text style={[styles.italicText, { color: tokens.statusOverdue }]}>
                  {t('orbitMcp.maxKeysReached')}
                </Text>
              </View>
            )}

            <SectionLabel>{t('orbitMcp.connectionInstructions')}</SectionLabel>
            <View style={styles.tabRow}>
              {MCP_CONFIG_TABS.map((tab) => (
                <Chip
                  key={tab}
                  active={activeConfigTab === tab}
                  onPress={() => setActiveConfigTab(tab)}
                >
                  {tab === 'web'
                    ? t('orbitMcp.claudeWeb')
                    : tab === 'desktop'
                      ? t('orbitMcp.claudeDesktop')
                      : t('orbitMcp.claudeCode')}
                </Chip>
              ))}
            </View>

            <View
              style={[
                styles.codeBlock,
                {
                  backgroundColor: tokens.bgSunk,
                  borderColor: tokens.hairline,
                },
              ]}
            >
              <Pressable
                onPress={() => {
                  void onCopy()
                }}
                accessibilityRole="button"
                accessibilityLabel={t('orbitMcp.copyConfig')}
                style={styles.copyBtn}
              >
                <Text
                  style={[
                    styles.copyBtnText,
                    { color: codeCopied ? tokens.statusDone : tokens.fg3 },
                  ]}
                >
                  {codeCopied ? t('orbitMcp.copied') : t('orbitMcp.copyConfig')}
                </Text>
              </Pressable>
              <Text
                style={[styles.codeText, { color: tokens.fg1 }]}
                selectable
              >
                {codeContent}
              </Text>
            </View>
            {activeConfigTab === 'web' ? (
              <View style={styles.hintPad}>
                <Text style={[styles.italicText, { color: tokens.fg3 }]}>
                  {t('orbitMcp.webNoApiKey')}
                </Text>
              </View>
            ) : (
              <View style={styles.hintPad}>
                <Text style={[styles.italicText, { color: tokens.fg3 }]}>
                  {t('orbitMcp.replaceKey')}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View
            style={[
              styles.lockedRow,
              { borderBottomColor: tokens.hairline },
            ]}
          >
            <Lock size={16} color={tokens.fg3} strokeWidth={1.4} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
                {t('orbitMcp.title')}
              </Text>
              <Text
                style={[styles.italicText, { color: tokens.fg3 }]}
                numberOfLines={3}
              >
                {t('orbitMcp.description')}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(buildUpgradeHref('/advanced'))}
              accessibilityRole="button"
              style={styles.linkPress}
            >
              <Text style={[styles.actionLink, { color: tokens.primary }]}>
                {t('common.proBadge')}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <ConfirmDialog
        open={showWidgetInfo}
        onOpenChange={setShowWidgetInfo}
        title={t('profile.widgetTitle')}
        description={t('profile.widgetHint')}
        variant="info"
      />

      <ConfirmDialog
        open={revokingKeyId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokingKeyId(null)
        }}
        title={t('orbitMcp.revoke')}
        description={t('orbitMcp.revokeConfirm')}
        cancelLabel={t('orbitMcp.cancel')}
        confirmLabel={t('orbitMcp.confirm')}
        onConfirm={() => {
          if (revokingKeyId) revokeKeyMutation.mutate(revokingKeyId)
        }}
      />

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

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  skelStack: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  skelBar: {
    height: 56,
    borderRadius: 8,
  },
  italicBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  italicText: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  errorBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  keyBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  keyTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyName: {
    fontFamily: 'Geist',
    fontSize: 14,
    flexShrink: 1,
  },
  keyPrefix: {
    fontFamily: 'GeistMono',
    fontSize: 11,
  },
  keyMeta: {
    fontFamily: 'Geist',
    fontSize: 12,
    fontStyle: 'italic',
  },
  revokeLink: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  },
  actionPad: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionLink: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '500',
  },
  linkPress: { padding: 4 },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lockedTitle: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  codeBlock: {
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    position: 'relative',
  },
  codeText: {
    fontFamily: 'GeistMono',
    fontSize: 12,
    lineHeight: 18,
  },
  copyBtn: {
    position: 'absolute',
    top: 6,
    right: 8,
    padding: 6,
    zIndex: 1,
  },
  copyBtnText: {
    fontFamily: 'Geist',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  hintPad: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
})
