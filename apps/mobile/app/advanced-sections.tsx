import { useState } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import Clipboard from '@react-native-clipboard/clipboard'
import {
  Check,
  CheckCircle,
  ChevronDown,
  Clipboard as ClipboardIcon,
  Clock,
  List,
  Plus,
  RotateCcw,
} from 'lucide-react-native'
import type { ApiKey } from '@orbit/shared/types'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
  type WidgetFeatureIconKey,
} from '@orbit/shared/utils/advanced-settings'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { Chip } from '@/components/ui/chip'
import { tintFromPrimary } from '@/lib/theme'
import { styles, type Tokens } from './advanced-styles'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

interface QueryStatus {
  isLoading: boolean
  error: Error | null
}

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

export function WidgetFeatureIcon({
  iconKey,
  color,
}: Readonly<{ iconKey: WidgetFeatureIconKey; color: string }>) {
  const iconProps = { size: 16, strokeWidth: 1.8, color }
  if (iconKey === 'checkCircle') return <CheckCircle {...iconProps} />
  if (iconKey === 'clock') return <Clock {...iconProps} />
  if (iconKey === 'list') return <List {...iconProps} />
  return <RotateCcw {...iconProps} />
}

/** Single-line message block (loading-empty / error / max-reached) used across
 *  the Orbit MCP developers section. */
export function QueryStateMessage({
  text,
  color,
}: Readonly<{ text: string; color: string }>) {
  return (
    <View style={styles.messageBlock}>
      <Text style={[styles.messageText, { color }]}>{text}</Text>
    </View>
  )
}

interface ApiKeyCardProps {
  apiKey: ApiKey
  index: number
  tokens: Tokens
  t: TranslationFn
  formatKeyDate: (dateStr: string) => string
  onRevoke: (id: string) => void
}

export function ApiKeyCard({
  apiKey,
  index,
  tokens,
  t,
  formatKeyDate,
  onRevoke,
}: Readonly<ApiKeyCardProps>) {
  const scopes = Array.isArray(apiKey.scopes) ? apiKey.scopes : []
  const expiresAtUtc = apiKey.expiresAtUtc ?? null
  const lastUsed = apiKey.lastUsedAtUtc
    ? `${t('orbitMcp.lastUsed')} ${formatKeyDate(apiKey.lastUsedAtUtc)}`
    : t('orbitMcp.never')
  const perm = apiKey.isReadOnly
    ? t('orbitMcp.permReadOnly')
    : t('orbitMcp.permReadWrite')
  const metaParts = [
    perm,
    lastUsed,
    `${t('orbitMcp.created')} ${formatKeyDate(apiKey.createdAtUtc)}`,
  ]
  if (expiresAtUtc) {
    metaParts.push(t('orbitMcp.expiresOn', { date: formatKeyDate(expiresAtUtc) }))
  }
  const meta = metaParts.join(' · ')
  return (
    <Animated.View
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
          {apiKey.name}
        </Text>
        <Pressable
          onPress={() => onRevoke(apiKey.id)}
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
            style={[styles.revokeLink, { color: tokens.statusBadText }]}
          >
            {t('orbitMcp.revoke')}
          </Text>
        </Pressable>
      </View>
      <Text
        style={[styles.keyPrefix, { color: tokens.fg2 }]}
      >
        {`${apiKey.keyPrefix}…`}
      </Text>
      <Text
        style={[styles.keyScopes, { color: tokens.fg3 }]}
        numberOfLines={2}
      >
        {scopes.length > 0 ? scopes.join(', ') : t('orbitMcp.noScopes')}
      </Text>
      <Text
        style={[styles.keyMeta, { color: tokens.fg3 }]}
        numberOfLines={2}
      >
        {meta}
      </Text>
    </Animated.View>
  )
}

interface ApiKeysSectionProps {
  apiKeysQuery: QueryStatus
  capabilitiesQuery: QueryStatus
  apiKeys: ApiKey[]
  canCreateKey: boolean
  canCreateScopedKey: boolean
  onCreateKey: () => void
  onRevoke: (id: string) => void
  formatKeyDate: (dateStr: string) => string
  t: TranslationFn
  tokens: Tokens
}

/** Orbit MCP "API keys" block: header with create action, description, and the
 *  loading / error / empty / list states for the user's keys. */
export function ApiKeysSection({
  apiKeysQuery,
  capabilitiesQuery,
  apiKeys,
  canCreateKey,
  canCreateScopedKey,
  onCreateKey,
  onRevoke,
  formatKeyDate,
  t,
  tokens,
}: Readonly<ApiKeysSectionProps>) {
  return (
    <>
      <View style={styles.apiKeysHeader}>
        <Text style={[styles.subsectionTitle, { color: tokens.fg1 }]}>
          {t('orbitMcp.apiKeys')}
        </Text>
        {canCreateKey ? (
          <Pressable
            onPress={onCreateKey}
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

      <Text style={[styles.apiKeysDescription, { color: tokens.fg3 }]}>
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
          <View style={[styles.skelBar, { backgroundColor: tokens.bgCard }]} />
          <View style={[styles.skelBar, { backgroundColor: tokens.bgCard }]} />
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
        <QueryStateMessage text={t('orbitMcp.noKeys')} color={tokens.fg3} />
      ) : null}

      {apiKeys.map((key, index) => (
        <ApiKeyCard
          key={key.id}
          apiKey={key}
          index={index}
          tokens={tokens}
          t={t}
          formatKeyDate={formatKeyDate}
          onRevoke={onRevoke}
        />
      ))}
    </>
  )
}

function McpCodeWell({
  content,
  copied,
  onCopy,
  t,
  tokens,
}: Readonly<{
  content: string
  copied: boolean
  onCopy: () => void
  t: TranslationFn
  tokens: Tokens
}>) {
  return (
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
          accessibilityLabel={copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}
          style={({ pressed }) => [
            styles.copyBtn,
            {
              backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
              borderColor: tokens.hairline,
            },
            pressed ? styles.actionChipPressed : null,
          ]}
          hitSlop={4}
        >
          {copied ? (
            <Check size={18} color={tokens.statusDone} strokeWidth={1.8} />
          ) : (
            <ClipboardIcon size={18} color={tokens.fg2} strokeWidth={1.8} />
          )}
        </Pressable>
      </View>
      <Text style={[styles.codeText, { color: tokens.fg2 }]} selectable>
        {content}
      </Text>
    </View>
  )
}

/** Collapsible "how to connect" instructions for the Orbit MCP endpoint, with
 *  Claude-web / Claude Code tabs and a copy-to-clipboard code well. */
export function McpConnectionInstructions({
  t,
  tokens,
}: Readonly<{ t: TranslationFn; tokens: Tokens }>) {
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [activeConfigTab, setActiveConfigTab] =
    useState<(typeof MCP_CONFIG_TABS)[number]>('web')
  const [configCopied, setConfigCopied] = useState(false)
  const [endpointCopied, setEndpointCopied] = useState(false)

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: withTiming(instructionsOpen ? '180deg' : '0deg', { duration: 220 }) },
    ],
  }))

  const mcpConfigJson = buildMcpConfigJson()

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
    <>
      <Pressable
        onPress={() => setInstructionsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: instructionsOpen }}
        style={({ pressed }) => [
          styles.disclosureHeader,
          pressed ? { backgroundColor: tokens.bgElev } : null,
        ]}
      >
        <Text style={[styles.subsectionTitle, { color: tokens.fg1 }]}>
          {t('orbitMcp.connectionInstructions')}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={20} color={tokens.fg3} strokeWidth={1.8} />
        </Animated.View>
      </Pressable>

      {instructionsOpen ? (
        <Animated.View
          entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
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

          <McpCodeWell
            content={codeContent}
            copied={codeCopied}
            onCopy={onCopy}
            t={t}
            tokens={tokens}
          />
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
  )
}

/** Widget how-to sheet: setup steps and feature list for the Android
 *  home-screen widget. */
export function WidgetInfoSheet({
  open,
  onClose,
  t,
  tokens,
}: Readonly<{
  open: boolean
  onClose: () => void
  t: TranslationFn
  tokens: Tokens
}>) {
  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
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
  )
}
