import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import { Lock, Plus, Smartphone } from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
} from '@orbit/shared/utils/advanced-settings'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Chip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useApiKeyManagement } from './advanced-api-keys'
import {
  ApiKeyCard,
  QueryStateMessage,
  WidgetFeatureIcon,
} from './advanced-sections'
import { styles } from './advanced-styles'

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

  const {
    apiKeysQuery,
    capabilitiesQuery,
    apiKeys,
    scopeOptions,
    canCreateKey,
    canCreateScopedKey,
    createKeyModalOpen,
    setCreateKeyModalOpen,
    createKeyError,
    revokingKeyId,
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  } = useApiKeyManagement({
    hasProAccess: profile?.hasProAccess ?? false,
    isOnline,
    queryClient,
    t,
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
              <QueryStateMessage
                text={t('orbitMcp.apiKeysError')}
                color={tokens.statusBad}
              />
            ) : null}

            {capabilitiesQuery.error && !capabilitiesQuery.isLoading ? (
              <QueryStateMessage
                text={t('orbitMcp.apiKeysError')}
                color={tokens.statusBad}
              />
            ) : null}

            {!apiKeysQuery.isLoading &&
            !apiKeysQuery.error &&
            apiKeys.length === 0 ? (
              <QueryStateMessage
                text={t('orbitMcp.noKeys')}
                color={tokens.fg3}
              />
            ) : null}

            {apiKeys.map((key, index) => (
              <ApiKeyCard
                key={key.id}
                apiKey={key}
                index={index}
                tokens={tokens}
                t={t}
                formatKeyDate={formatKeyDate}
                onRevoke={setRevokingKeyId}
              />
            ))}

            {canCreateKey ? (
              <View style={styles.actionPad}>
                <Pressable
                  onPress={() => setCreateKeyModalOpen(true)}
                  disabled={!canCreateScopedKey}
                  accessibilityRole="button"
                  accessibilityLabel={t('orbitMcp.createKey')}
                  accessibilityState={{ disabled: !canCreateScopedKey }}
                  style={({ pressed }) => [
                    styles.createKeyChip,
                    {
                      backgroundColor: tokens.selectionBg,
                      borderColor: tintFromPrimary(tokens, 0.45),
                    },
                    !canCreateScopedKey ? styles.createKeyChipDisabled : null,
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
              <QueryStateMessage
                text={t('orbitMcp.maxKeysReached')}
                color={tokens.statusOverdueText}
              />
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
              <View style={styles.copyRow}>
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
              </View>
              <Text
                style={[styles.codeText, { color: tokens.fg2 }]}
                selectable
              >
                {codeContent}
              </Text>
            </View>
            <View style={styles.hintPad}>
              <Text style={[styles.hintText, { color: tokens.fg3 }]}>
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

      <BottomSheetModal
        open={showWidgetInfo}
        onClose={() => setShowWidgetInfo(false)}
        title={t('profile.widgetTitle')}
        contentKey="widget-info"
        snapPoints={['70%']}
      >
        <ScrollView
          style={styles.widgetSheetScroll}
          contentContainerStyle={styles.widgetSheetContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.widgetHeading, { color: tokens.fg1 }]}>
            {t('profile.widgetHow.title')}
          </Text>
          <View style={styles.widgetList}>
            {WIDGET_STEP_KEYS.map((stepKey, index) => (
              <View key={stepKey} style={styles.widgetStepRow}>
                <Text style={[styles.widgetStepNumber, { color: tokens.primary }]}>
                  {`${index + 1}.`}
                </Text>
                <Text style={[styles.widgetItemText, { color: tokens.fg2 }]}>
                  {t(stepKey)}
                </Text>
              </View>
            ))}
          </View>

          <Text style={[styles.widgetHeading, { color: tokens.fg1 }]}>
            {t('profile.widgetHow.featuresTitle')}
          </Text>
          <View style={styles.widgetList}>
            {WIDGET_FEATURES.map((feature) => (
              <View key={feature.textKey} style={styles.widgetFeatureRow}>
                <WidgetFeatureIcon iconKey={feature.iconKey} color={tokens.primary} />
                <Text style={[styles.widgetItemText, { color: tokens.fg2 }]}>
                  {t(feature.textKey)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </BottomSheetModal>

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
