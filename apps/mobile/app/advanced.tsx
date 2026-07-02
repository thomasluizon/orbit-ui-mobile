import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import Clipboard from '@react-native-clipboard/clipboard'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import {
  Check,
  ChevronDown,
  Clipboard as ClipboardIcon,
  Lock,
  Plus,
  Smartphone,
} from 'lucide-react-native'
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
import { ProBadge } from '@/components/ui/pro-badge'
import { Chip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useApiKeyManagement } from './advanced-api-keys'
import {
  ApiKeyCard,
  QueryStateMessage,
  WidgetFeatureIcon,
} from './advanced-sections'
import { styles } from './advanced-styles'

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
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
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: withTiming(instructionsOpen ? '180deg' : '0deg', { duration: 220 }) },
    ],
  }))

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

  function copyEndpoint() {
    Clipboard.setString(MCP_ENDPOINT_URL)
    setEndpointCopied(true)
    setTimeout(() => setEndpointCopied(false), 2000)
  }

  function copyConfig() {
    Clipboard.setString(mcpConfigJson)
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
        backLabel={t('common.backToProfile')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={sectionEntrance(0)}>
          <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
          <SettingsRow
            label={t('profile.widgetTitle')}
            desc={t('profile.widgetHint')}
            icon={Smartphone}
            onPress={() => setShowWidgetInfo(true)}
            accessory="chevron"
            divider={false}
          />
        </Animated.View>

        <Animated.View entering={sectionEntrance(1)}>
          <SectionLabel trailing={<ProBadge />}>{t('orbitMcp.title')}</SectionLabel>

          <View style={localStyles.mcpIntro}>
            {!profile?.hasProAccess ? (
              <View style={localStyles.upgradeRow}>
                <Pressable
                  onPress={() => router.push(buildUpgradeHref('/advanced'))}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.proBadge')}
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
                  <Lock size={14} color={tokens.primary} strokeWidth={1.8} />
                  <Text style={[styles.actionLink, { color: tokens.primary }]}>
                    {t('common.proBadge')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <Text style={[localStyles.mcpDescription, { color: tokens.fg3 }]}>
              {t('orbitMcp.description')}
            </Text>
          </View>

          {profile?.hasProAccess ? (
            <>
              <View style={localStyles.apiKeysHeader}>
                <Text style={[localStyles.subsectionTitle, { color: tokens.fg1 }]}>
                  {t('orbitMcp.apiKeys')}
                </Text>
                {canCreateKey ? (
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
                      {t('orbitMcp.createKeyShort')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <Text
                style={[localStyles.apiKeysDescription, { color: tokens.fg3 }]}
              >
                {t('orbitMcp.apiKeysDescription')}
              </Text>

              {!canCreateKey ? (
                <QueryStateMessage
                  text={t('orbitMcp.maxKeysReached')}
                  color={tokens.statusOverdueText}
                />
              ) : null}

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

              {(apiKeysQuery.error || capabilitiesQuery.error) &&
              !apiKeysQuery.isLoading &&
              !capabilitiesQuery.isLoading ? (
                <QueryStateMessage
                  text={t('orbitMcp.apiKeysError')}
                  color={tokens.statusBadText}
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

              <Pressable
                onPress={() => setInstructionsOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: instructionsOpen }}
                style={({ pressed }) => [
                  localStyles.disclosureHeader,
                  pressed ? { backgroundColor: tokens.bgElev } : null,
                ]}
              >
                <Text style={[localStyles.subsectionTitle, { color: tokens.fg1 }]}>
                  {t('orbitMcp.connectionInstructions')}
                </Text>
                <Animated.View style={chevronStyle}>
                  <ChevronDown size={20} color={tokens.fg3} strokeWidth={1.8} />
                </Animated.View>
              </Pressable>

              {instructionsOpen ? (
                <Animated.View
                  entering={FadeInDown.duration(220).reduceMotion(
                    ReduceMotion.System,
                  )}
                >
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
                          onCopy()
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          codeCopied ? t('orbitMcp.copied') : t('orbitMcp.copy')
                        }
                        style={({ pressed }) => [
                          styles.copyBtn,
                          {
                            backgroundColor: pressed
                              ? tokens.bgElev2
                              : tokens.bgElev,
                            borderColor: tokens.hairline,
                          },
                          pressed ? styles.actionChipPressed : null,
                        ]}
                        hitSlop={4}
                      >
                        {codeCopied ? (
                          <Check
                            size={18}
                            color={tokens.statusDone}
                            strokeWidth={1.8}
                          />
                        ) : (
                          <ClipboardIcon
                            size={18}
                            color={tokens.fg2}
                            strokeWidth={1.8}
                          />
                        )}
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
                </Animated.View>
              ) : null}
            </>
          ) : null}
        </Animated.View>

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

const localStyles = StyleSheet.create({
  mcpIntro: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  upgradeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  mcpDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  apiKeysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
  },
  subsectionTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    letterSpacing: -0.16,
  },
  apiKeysDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
})
