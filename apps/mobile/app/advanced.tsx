import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import { Lock, Plus, Smartphone } from 'lucide-react-native'
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
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Chip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

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
          desc={t('profile.widgetHint')}
          icon={Smartphone}
          onPress={() => setShowWidgetInfo(true)}
          accessory="chevron"
          divider={false}
        />

        <SectionLabel>{t('advancedSettings.developersSection')}</SectionLabel>

        {profile?.hasProAccess ? (
          <>
            {apiKeysQuery.isLoading ? (
              <View style={styles.skelStack}>
                <View
                  style={[styles.skelBar, { backgroundColor: tokens.bgCard }]}
                />
                <View
                  style={[styles.skelBar, { backgroundColor: tokens.bgCard }]}
                />
              </View>
            ) : null}

            {apiKeysQuery.error && !apiKeysQuery.isLoading ? (
              <View style={styles.messageBlock}>
                <Text style={[styles.messageText, { color: tokens.statusBad }]}>
                  {t('orbitMcp.apiKeysError')}
                </Text>
              </View>
            ) : null}

            {!apiKeysQuery.isLoading &&
            !apiKeysQuery.error &&
            apiKeys.length === 0 ? (
              <View style={styles.messageBlock}>
                <Text style={[styles.messageText, { color: tokens.fg3 }]}>
                  {t('orbitMcp.noKeys')}
                </Text>
              </View>
            ) : null}

            {apiKeys.map((key, index) => {
              const lastUsed = key.lastUsedAtUtc
                ? `${t('orbitMcp.lastUsed')} ${formatKeyDate(key.lastUsedAtUtc)}`
                : t('orbitMcp.never')
              const perm = key.isReadOnly
                ? t('orbitMcp.permReadOnly')
                : t('orbitMcp.permReadWrite')
              const meta = `${perm} · ${lastUsed} · ${t('orbitMcp.created')} ${formatKeyDate(key.createdAtUtc)}`
              return (
                <Animated.View
                  key={key.id}
                  entering={rowEntrance(index)}
                  style={[
                    styles.keyCard,
                    {
                      backgroundColor: tokens.bgCard,
                      borderColor: tokens.hairline,
                    },
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
                      style={({ pressed }) => [
                        styles.actionChip,
                        {
                          backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                          borderColor: tokens.hairline,
                        },
                        pressed ? styles.actionChipPressed : null,
                      ]}
                      hitSlop={8}
                    >
                      <Text
                        style={[styles.revokeLink, { color: tokens.statusBad }]}
                      >
                        {t('orbitMcp.revoke')}
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={[styles.keyPrefix, { color: tokens.fg2 }]}
                  >
                    {`${key.keyPrefix}…`}
                  </Text>
                  <Text
                    style={[styles.keyMeta, { color: tokens.fg4 }]}
                    numberOfLines={2}
                  >
                    {meta}
                  </Text>
                </Animated.View>
              )
            })}

            {canCreateKey ? (
              <View style={styles.actionPad}>
                <Pressable
                  onPress={() => setCreateKeyModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('orbitMcp.createKey')}
                  style={({ pressed }) => [
                    styles.createKeyChip,
                    {
                      backgroundColor: tokens.selectionBg,
                      borderColor: tintFromPrimary(tokens, 0.45),
                    },
                    pressed ? styles.actionChipPressed : null,
                  ]}
                  hitSlop={8}
                >
                  <Plus size={14} color={tokens.primary} strokeWidth={2.2} />
                  <Text style={[styles.actionLink, { color: tokens.primary }]}>
                    {t('orbitMcp.createKey')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.messageBlock}>
                <Text
                  style={[styles.messageText, { color: tokens.statusOverdue }]}
                >
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
                styles.codeWell,
                {
                  backgroundColor: tokens.bgField,
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
                style={({ pressed }) => [
                  styles.copyBtn,
                  {
                    backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                    borderColor: tokens.hairline,
                  },
                  pressed ? styles.actionChipPressed : null,
                ]}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.copyBtnText,
                    { color: codeCopied ? tokens.statusDone : tokens.fg2 },
                  ]}
                >
                  {codeCopied ? t('orbitMcp.copied') : t('orbitMcp.copyConfig')}
                </Text>
              </Pressable>
              <Text
                style={[styles.codeText, { color: tokens.fg2 }]}
                selectable
              >
                {codeContent}
              </Text>
            </View>
            <View style={styles.hintPad}>
              <Text style={[styles.hintText, { color: tokens.fg4 }]}>
                {activeConfigTab === 'web'
                  ? t('orbitMcp.webNoApiKey')
                  : t('orbitMcp.replaceKey')}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.lockedRow}>
            <Lock size={16} color={tokens.fg3} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
                {t('orbitMcp.title')}
              </Text>
              <Text
                style={[styles.lockedDesc, { color: tokens.fg3 }]}
                numberOfLines={3}
              >
                {t('orbitMcp.description')}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(buildUpgradeHref('/advanced'))}
              accessibilityRole="button"
              accessibilityLabel={t('common.proBadge')}
              style={({ pressed }) => [
                styles.actionChip,
                {
                  backgroundColor: tokens.selectionBg,
                  borderColor: tintFromPrimary(tokens, 0.45),
                },
                pressed ? styles.actionChipPressed : null,
              ]}
              hitSlop={8}
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
        description={`1. ${t('profile.widgetHow.step1')}\n\n2. ${t('profile.widgetHow.step2')}\n\n3. ${t('profile.widgetHow.step3')}`}
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
    height: 64,
    borderRadius: 16,
  },
  messageBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  messageText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  keyCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  keyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyName: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    flexShrink: 1,
  },
  keyPrefix: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  keyMeta: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  revokeLink: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  actionPad: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createKeyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  actionLink: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  lockedTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
  lockedDesc: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  codeWell: {
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    position: 'relative',
  },
  codeText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12.5,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    zIndex: 1,
  },
  copyBtnText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
  },
  hintPad: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  hintText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
})
