import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import { Lock, Smartphone } from '@/components/ui/icons'
import { useQueryClient } from '@tanstack/react-query'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useApiKeyManagement } from './advanced-api-keys'
import {
  ApiKeysSection,
  McpConnectionInstructions,
  WidgetInfoSheet,
} from './advanced-sections'
import { styles, type Tokens } from './advanced-styles'

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

function McpUpgradeChip({
  onPress,
  label,
  tokens,
}: Readonly<{ onPress: () => void; label: string; tokens: Tokens }>) {
  return (
    <View style={localStyles.upgradeRow}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
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
          {label}
        </Text>
      </Pressable>
    </View>
  )
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

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: dateFnsLocale,
    })
  }

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
          />
        </Animated.View>

        <Animated.View entering={sectionEntrance(1)}>
          <SectionLabel trailing={<ProBadge />}>{t('orbitMcp.title')}</SectionLabel>

          <View style={localStyles.mcpIntro}>
            {!profile?.hasProAccess ? (
              <McpUpgradeChip
                onPress={() => router.push(buildUpgradeHref('/advanced'))}
                label={t('common.proBadge')}
                tokens={tokens}
              />
            ) : null}
            <Text style={[localStyles.mcpDescription, { color: tokens.fg3 }]}>
              {t('orbitMcp.description')}
            </Text>
          </View>

          {profile?.hasProAccess ? (
            <>
              <ApiKeysSection
                apiKeysQuery={apiKeysQuery}
                capabilitiesQuery={capabilitiesQuery}
                apiKeys={apiKeys}
                canCreateKey={canCreateKey}
                canCreateScopedKey={canCreateScopedKey}
                onCreateKey={() => setCreateKeyModalOpen(true)}
                onRevoke={setRevokingKeyId}
                formatKeyDate={formatKeyDate}
                t={t}
                tokens={tokens}
              />

              <McpConnectionInstructions t={t} tokens={tokens} />
            </>
          ) : null}
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <WidgetInfoSheet
        open={showWidgetInfo}
        onClose={() => setShowWidgetInfo(false)}
        t={t}
        tokens={tokens}
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
})
